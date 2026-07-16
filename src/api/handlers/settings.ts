import { HttpApiBuilder } from '@effect/platform'
import { eq, inArray, sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database, type DrizzleDatabase } from '../../database/layer'
import { libraryPathPrefixPattern } from '../../database/path-prefix'
import * as schema from '../../database/schema'
import {
  defaultLibraryName,
  pathIsReadable,
  validateLibraryInput
} from '../../services/library-validation'
import { Scheduler } from '../../services/scheduler'
import {
  defaultScanSchedule,
  getSetting,
  isScanScheduleValue,
  scanScheduleSettingKey,
  setSetting
} from '../../services/settings'
import { jukeboxApi } from '../contract'
import { BadRequest, InternalError, LibraryInUse, NotFound } from '../contract/errors'

import { listLibrariesEffect } from './library-list'
import {
  internalTry,
  internalTryPromise,
  serializeLibrary,
  withHandlerSpan
} from './support'

// Keys that have dedicated routes with their own validation. The generic
// /:key handlers must not read or write these or they bypass those
// validators (e.g. writing "garbage" to scanSchedule).
const reservedKeys = new Set<string>([scanScheduleSettingKey])

const reservedKeyRoute: Record<string, string> = {
  [scanScheduleSettingKey]: '/api/settings/scan-schedule'
}

function countLibraryReferences(
  db: DrizzleDatabase,
  library: schema.Library,
  pattern: string
): number {
  if (library.type === 'movies') {
    const [row] = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.movies)
      .where(sql`${schema.movies.filePath} LIKE ${pattern} ESCAPE '\\'`)
      .all()

    return row?.count ?? 0
  }

  const [row] = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.shows)
    .where(sql`${schema.shows.folderPath} LIKE ${pattern} ESCAPE '\\'`)
    .all()

  return row?.count ?? 0
}

// Ports src/api/routes/settings.ts.
export const settingsHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'settings',
  (handlers) =>
    handlers
      .handle('listLibraries', () =>
        withHandlerSpan('listLibraries', listLibrariesEffect)
      )
      .handle('createLibrary', ({ payload }) =>
        withHandlerSpan('createLibrary',
          Effect.gen(function* () {
            const db = yield* Database
            const parsed = validateLibraryInput(payload)

            if (typeof parsed === 'string') {
              return yield* Effect.fail(new BadRequest({ message: parsed }))
            }

            const readable = yield* Effect.promise(() =>
              pathIsReadable(parsed.path)
            )

            if (!readable) {
              return yield* Effect.fail(
                new BadRequest({
                  message: `Library path doesn't exist or isn't readable: ${parsed.path}. Check the path and Jukebox's file permissions.`
                })
              )
            }

            const [existing] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.libraries)
                .where(eq(schema.libraries.path, parsed.path))
                .limit(1)
            )

            if (existing) {
              return yield* Effect.fail(
                new BadRequest({
                  message: `A library at ${parsed.path} already exists.`
                })
              )
            }

            const resolvedName =
              parsed.name.length > 0
                ? parsed.name
                : defaultLibraryName(parsed.path, parsed.type)

            const [created] = yield* internalTryPromise(() =>
              db
                .insert(schema.libraries)
                .values({
                  name: resolvedName,
                  path: parsed.path,
                  type: parsed.type,
                  createdAt: new Date()
                })
                .returning()
            )

            if (!created) {
              return yield* Effect.fail(
                new InternalError({ message: 'Failed to create library.' })
              )
            }

            return serializeLibrary(created)
          })
        )
      )
      .handle('deleteLibrary', ({ path: pathParams, urlParams }) =>
        withHandlerSpan('deleteLibrary',
          Effect.gen(function* () {
            const db = yield* Database

            // The contract keeps :id a raw string so a non-numeric id answers
            // with today's exact 400 message instead of a schema summary.
            const id = Number.parseInt(pathParams.id, 10)

            if (!Number.isFinite(id)) {
              return yield* Effect.fail(
                new BadRequest({ message: 'Invalid library id.' })
              )
            }

            const [existing] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.libraries)
                .where(eq(schema.libraries.id, id))
                .limit(1)
            )

            if (!existing) {
              return yield* Effect.fail(
                new NotFound({ message: 'Library not found.' })
              )
            }

            const force = urlParams.force === 'true'
            const pattern = libraryPathPrefixPattern(existing.path)

            if (!force) {
              const referenceCount = yield* internalTry(() =>
                countLibraryReferences(db, existing, pattern)
              )

              if (referenceCount > 0) {
                const noun =
                  existing.type === 'movies'
                    ? referenceCount === 1
                      ? 'movie'
                      : 'movies'
                    : referenceCount === 1
                      ? 'show'
                      : 'shows'

                return yield* Effect.fail(
                  new LibraryInUse({
                    message: `Couldn't remove library — ${referenceCount} ${noun} reference it. Remove them first or use 'Force remove'.`,
                    referenceCount
                  })
                )
              }

              yield* internalTry(() =>
                db
                  .delete(schema.libraries)
                  .where(eq(schema.libraries.id, id))
                  .run()
              )

              return { success: true }
            }

            // Force remove: cascade-delete the library's rows and the library
            // itself atomically so a crash mid-flight can't leave orphans.
            // `db.transaction` requires a synchronous callback, so every query
            // uses `.run()` / `.all()` (no `await`).
            yield* internalTry(() =>
              db.transaction((tx) => {
                if (existing.type === 'movies') {
                  const movieIds = tx
                    .select({ id: schema.movies.id })
                    .from(schema.movies)
                    .where(
                      sql`${schema.movies.filePath} LIKE ${pattern} ESCAPE '\\'`
                    )
                    .all()
                    .map((row) => row.id)

                  if (movieIds.length > 0) {
                    tx.delete(schema.watchProgress)
                      .where(inArray(schema.watchProgress.movieId, movieIds))
                      .run()

                    tx.delete(schema.movies)
                      .where(inArray(schema.movies.id, movieIds))
                      .run()
                  }
                } else {
                  const showIds = tx
                    .select({ id: schema.shows.id })
                    .from(schema.shows)
                    .where(
                      sql`${schema.shows.folderPath} LIKE ${pattern} ESCAPE '\\'`
                    )
                    .all()
                    .map((row) => row.id)

                  if (showIds.length > 0) {
                    const episodeIds = tx
                      .select({ id: schema.episodes.id })
                      .from(schema.episodes)
                      .where(inArray(schema.episodes.showId, showIds))
                      .all()
                      .map((row) => row.id)

                    if (episodeIds.length > 0) {
                      tx.delete(schema.watchProgress)
                        .where(
                          inArray(schema.watchProgress.episodeId, episodeIds)
                        )
                        .run()

                      tx.delete(schema.episodes)
                        .where(inArray(schema.episodes.id, episodeIds))
                        .run()
                    }

                    tx.delete(schema.seasons)
                      .where(inArray(schema.seasons.showId, showIds))
                      .run()

                    tx.delete(schema.shows)
                      .where(inArray(schema.shows.id, showIds))
                      .run()
                  }
                }

                tx.delete(schema.libraries)
                  .where(eq(schema.libraries.id, id))
                  .run()
              })
            )

            return { success: true }
          })
        )
      )
      .handle('getScanSchedule', () =>
        withHandlerSpan('getScanSchedule',
          Effect.gen(function* () {
            const db = yield* Database
            const scheduler = yield* Scheduler
            const stored = yield* internalTryPromise(() =>
              getSetting(scanScheduleSettingKey, db)
            )
            const value =
              stored !== null && isScanScheduleValue(stored)
                ? stored
                : defaultScanSchedule

            const info = yield* scheduler.getInfo

            return {
              nextRunAt: info.nextRunAt?.toISOString() ?? null,
              schedule: value
            }
          })
        )
      )
      .handle('updateScanSchedule', ({ payload }) =>
        withHandlerSpan('updateScanSchedule',
          Effect.gen(function* () {
            const db = yield* Database
            const scheduler = yield* Scheduler
            const schedule =
              typeof payload.schedule === 'string' ? payload.schedule.trim() : ''

            if (!isScanScheduleValue(schedule)) {
              return yield* Effect.fail(
                new BadRequest({
                  message: 'Scan schedule must be one of: off, 6h, 12h, 24h.'
                })
              )
            }

            yield* internalTryPromise(() =>
              setSetting(scanScheduleSettingKey, schedule, db)
            )

            yield* scheduler.updateSchedule(schedule)

            const info = yield* scheduler.getInfo

            return {
              nextRunAt: info.nextRunAt?.toISOString() ?? null,
              schedule
            }
          })
        )
      )
      .handle('getSetting', ({ path: pathParams }) =>
        withHandlerSpan('getSetting',
          Effect.gen(function* () {
            const db = yield* Database
            const key = pathParams.key

            if (reservedKeys.has(key)) {
              return yield* Effect.fail(
                new BadRequest({
                  message: `Use GET ${reservedKeyRoute[key]} for this key.`
                })
              )
            }

            const value = yield* internalTryPromise(() => getSetting(key, db))

            return { value }
          })
        )
      )
      .handle('updateSetting', ({ path: pathParams, payload }) =>
        withHandlerSpan('updateSetting',
          Effect.gen(function* () {
            const db = yield* Database
            const key = pathParams.key

            if (reservedKeys.has(key)) {
              return yield* Effect.fail(
                new BadRequest({
                  message: `Use PUT ${reservedKeyRoute[key]} for this key.`
                })
              )
            }

            const value = payload.value

            if (typeof value !== 'string') {
              return yield* Effect.fail(
                new BadRequest({ message: 'Setting value must be a string.' })
              )
            }

            yield* internalTryPromise(() => setSetting(key, value, db))

            return { value }
          })
        )
      )
)
