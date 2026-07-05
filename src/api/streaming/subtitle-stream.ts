import path from 'path'

import {
  FileSystem,
  HttpApiBuilder,
  HttpRouter,
  HttpServerResponse
} from '@effect/platform'
import { eq } from 'drizzle-orm'
import { Effect, Ref } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { convertSrtToVtt } from '../../services/subtitles'
import { internalTry, internalTryPromise } from '../handlers/support'
import { makeSessionCheck } from '../middleware/session'

const conversionFailedMessage =
  "Couldn't convert subtitle file. Check it's a valid SRT."

const outsideLibraryMessage =
  'Subtitle is outside the configured library paths. Rescan your libraries.'

const vttResponseOptions = {
  contentType: 'text/vtt; charset=utf-8',
  headers: { 'cache-control': 'public, max-age=3600' }
}

// Defense-in-depth: even though the scanner only writes sidecar paths that sit
// under a configured library, confirm the stored path still resolves under one
// of them before handing it to the filesystem. Guards against library removal,
// manual DB edits, and path traversal via legacy rows.
function subtitleIsInsideALibrary(
  subtitleFilePath: string,
  libraryPaths: string[]
): boolean {
  const resolvedSubtitle = path.resolve(subtitleFilePath)

  for (const libraryPath of libraryPaths) {
    const resolvedLibrary = path.resolve(libraryPath)
    const libraryWithSeparator = resolvedLibrary.endsWith(path.sep)
      ? resolvedLibrary
      : `${resolvedLibrary}${path.sep}`

    if (resolvedSubtitle.startsWith(libraryWithSeparator)) {
      return true
    }
  }

  return false
}

const jsonError = (status: number, message: string) =>
  HttpServerResponse.json({ error: { message } }, { status }).pipe(Effect.orDie)

// GET /api/subtitles/:id — serves the subtitle as WebVTT. Ports
// src/api/routes/subtitles.ts: .vtt files are served as-is, .srt files are
// converted on the fly, .ass is rejected with 415.
export const subtitleStreamRouteLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const db = yield* Database
    const lastSweepAtRef = yield* Ref.make(0)

    yield* router.get(
      '/api/subtitles/:id',
      Effect.gen(function* () {
        yield* makeSessionCheck(db, lastSweepAtRef)

        const fileSystem = yield* FileSystem.FileSystem
        const params = yield* HttpRouter.params
        const id = parseInt(params.id ?? '', 10)

        if (isNaN(id)) {
          return yield* jsonError(400, 'Invalid subtitle ID')
        }

        const [subtitle] = yield* internalTryPromise(() =>
          db
            .select()
            .from(schema.subtitles)
            .where(eq(schema.subtitles.id, id))
            .limit(1)
        )

        if (!subtitle) {
          return yield* jsonError(404, 'Subtitle not found')
        }

        const libraries = yield* internalTryPromise(() =>
          db.select({ path: schema.libraries.path }).from(schema.libraries)
        )

        const libraryPaths = libraries.map((library) => library.path)

        if (!subtitleIsInsideALibrary(subtitle.filePath, libraryPaths)) {
          // 404 (not 500) so we don't disclose that the row exists but sits
          // outside a configured library.
          yield* Effect.logWarning(
            `Refusing to serve subtitle ${subtitle.id} — ${subtitle.filePath} is not inside any configured library. Rescan the library to clean up stale rows.`
          )

          return yield* jsonError(404, outsideLibraryMessage)
        }

        if (subtitle.format === 'ass') {
          return HttpServerResponse.text(
            "ASS subtitles aren't supported by the web player. Convert the file to .srt or .vtt and rescan.",
            { status: 415 }
          )
        }

        const readResult = yield* fileSystem
          .readFileString(subtitle.filePath, 'utf-8')
          .pipe(Effect.either)

        if (readResult._tag === 'Left') {
          yield* Effect.logWarning(
            `Couldn't read subtitle file ${subtitle.filePath} - ${readResult.left.message}. Make sure the file still exists at that path and rescan the library.`
          )

          return HttpServerResponse.text(conversionFailedMessage, {
            status: 500
          })
        }

        const raw = readResult.right

        if (subtitle.format === 'vtt') {
          return HttpServerResponse.text(raw, vttResponseOptions)
        }

        // Format must be 'srt' at this point.
        const converted = yield* internalTry(() => convertSrtToVtt(raw)).pipe(
          Effect.either
        )

        if (converted._tag === 'Left') {
          yield* Effect.logWarning(
            `Couldn't convert subtitle file ${subtitle.filePath} to WebVTT - ${converted.left.message}. Convert the file to UTF-8 .vtt and rescan.`
          )

          return HttpServerResponse.text(conversionFailedMessage, {
            status: 500
          })
        }

        return HttpServerResponse.text(converted.right, vttResponseOptions)
      }).pipe(
        Effect.catchTags({
          InternalError: (error) => jsonError(500, error.message),
          Unauthorized: (error) => jsonError(401, error.message)
        })
      )
    )
  })
)
