import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import {
  defaultLibraryName,
  pathIsReadable,
  validateLibraryInput,
  type LibraryInput
} from '../../services/library-validation'
import { jukeboxApi } from '../contract'
import {
  BadRequest,
  SetupValidationError,
  type SetupFieldError
} from '../contract/errors'

import {
  internalTry,
  internalTryPromise,
  serializeLibrary,
  withHandlerSpan
} from './support'

function comparablePath(path: string): string {
  // Windows paths are case-insensitive; catching C:\Media vs c:\media here.
  return process.platform === 'win32' ? path.toLowerCase() : path
}

// Ports src/api/routes/setup.ts.
export const setupHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'setup',
  (handlers) =>
    handlers
      .handle('getStatus', () =>
        withHandlerSpan('getStatus',
          Effect.gen(function* () {
            const db = yield* Database
            const libraries = yield* internalTryPromise(() =>
              db.select().from(schema.libraries)
            )

            return {
              libraries: libraries.map(serializeLibrary),
              libraryCount: libraries.length,
              needsSetup: libraries.length === 0
            }
          })
        )
      )
      .handle('completeSetup', ({ payload }) =>
        withHandlerSpan('completeSetup',
          Effect.gen(function* () {
            const db = yield* Database
            const entries = Array.isArray(payload.libraries)
              ? payload.libraries
              : []

            if (entries.length === 0) {
              return yield* Effect.fail(
                new BadRequest({
                  message: 'Add at least one folder before completing setup.'
                })
              )
            }

            const seenPaths = new Set<string>()

            const parsedEntries = entries.map((entry, index) => {
              const parsed = validateLibraryInput(entry)

              if (typeof parsed === 'string') {
                const message =
                  parsed === 'Library path is required.'
                    ? 'Enter a folder path or remove this row.'
                    : parsed

                return { index, message, parsed: null }
              }

              const pathKey = comparablePath(parsed.path)

              if (seenPaths.has(pathKey)) {
                return {
                  index,
                  message: `You've added ${parsed.path} more than once. Remove the duplicate row.`,
                  parsed: null
                }
              }

              seenPaths.add(pathKey)

              return { index, message: null, parsed }
            })

            // The readability checks hit the filesystem, so run them for all
            // rows at once instead of one folder at a time.
            const readableFlags = yield* Effect.promise(() =>
              Promise.all(
                parsedEntries.map((entry) =>
                  entry.parsed
                    ? pathIsReadable(entry.parsed.path)
                    : Promise.resolve(false)
                )
              )
            )

            const fieldErrors: SetupFieldError[] = []
            const validated: LibraryInput[] = []

            for (const entry of parsedEntries) {
              if (entry.message !== null || entry.parsed === null) {
                fieldErrors.push({
                  index: entry.index,
                  message:
                    entry.message ?? 'Enter a folder path or remove this row.'
                })
                continue
              }

              if (!readableFlags[entry.index]) {
                fieldErrors.push({
                  index: entry.index,
                  message: `Library path doesn't exist or isn't readable: ${entry.parsed.path}. Check the path and Jukebox's file permissions.`
                })
                continue
              }

              validated.push({
                ...entry.parsed,
                name:
                  entry.parsed.name.length > 0
                    ? entry.parsed.name
                    : defaultLibraryName(entry.parsed.path, entry.parsed.type)
              })
            }

            if (fieldErrors.length > 0) {
              return yield* Effect.fail(
                new SetupValidationError({
                  fieldErrors,
                  message: 'Fix the highlighted folders, then try again.'
                })
              )
            }

            const now = new Date()

            // Replace all libraries atomically — a failure mid-insert must not
            // leave the user with an empty (or partial) library set.
            // `db.transaction` requires a synchronous callback, so every query
            // uses `.run()`.
            yield* internalTry(() =>
              db.transaction((tx) => {
                tx.delete(schema.libraries).run()

                for (const library of validated) {
                  tx.insert(schema.libraries)
                    .values({
                      name: library.name,
                      path: library.path,
                      type: library.type,
                      createdAt: now
                    })
                    .run()
                }
              })
            )

            return { success: true }
          })
        )
      )
)
