import path from 'path'

import {
  FileSystem,
  HttpApiBuilder,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from '@effect/platform'
import { eq } from 'drizzle-orm'
import { Effect, Ref } from 'effect'
import invariant from 'tiny-invariant'

import { Database, type DrizzleDatabase } from '../../database/layer'
import * as schema from '../../database/schema'
import { InternalError, Unauthorized } from '../contract/errors'
import { internalTry, internalTryPromise } from '../handlers/support'
import { makeSessionCheck } from '../middleware/session'

const mimeTypes: Record<string, string> = {
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
}

function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()

  return mimeTypes[extension] ?? 'video/mp4'
}

export interface ByteRange {
  chunkSize: number
  end: number
  start: number
}

// Same parsing the Hono routes did inline: a missing end means
// "to the last byte", and a malformed header throws — surfaced as the same
// 500 `Invalid Range header` the Hono app.onError produced.
export function parseRange(rangeHeader: string, fileSize: number): ByteRange {
  const parts = rangeHeader.replace(/bytes=/, '').split('-')

  invariant(parts[0], 'Invalid Range header')

  const start = parseInt(parts[0], 10)
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

  return { chunkSize: end - start + 1, end, start }
}

const jsonError = (status: number, message: string) =>
  HttpServerResponse.json({ error: { message } }, { status }).pipe(Effect.orDie)

// Streams a video file with Range support, byte-compatible with the Hono
// stream routes: 206 + Content-Range for range requests, 200 otherwise,
// Accept-Ranges and Content-Length always set.
const streamVideoFile = (filePath: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const request = yield* HttpServerRequest.HttpServerRequest

    const exists = yield* fileSystem
      .exists(filePath)
      .pipe(Effect.orElseSucceed(() => false))

    if (!exists) {
      return yield* jsonError(404, 'Video file not found')
    }

    const stat = yield* fileSystem.stat(filePath).pipe(
      Effect.mapError(
        (error) => new InternalError({ message: error.message })
      )
    )

    const fileSize = Number(stat.size)
    const mimeType = getMimeType(filePath)
    const rangeHeader = request.headers['range']

    if (rangeHeader) {
      const range = yield* internalTry(() => parseRange(rangeHeader, fileSize))

      return HttpServerResponse.stream(
        fileSystem.stream(filePath, {
          bytesToRead: range.chunkSize,
          offset: range.start
        }),
        {
          contentLength: range.chunkSize,
          contentType: mimeType,
          headers: {
            'accept-ranges': 'bytes',
            'content-range': `bytes ${range.start}-${range.end}/${fileSize}`
          },
          status: 206
        }
      )
    }

    return HttpServerResponse.stream(fileSystem.stream(filePath), {
      contentLength: fileSize,
      contentType: mimeType,
      headers: { 'accept-ranges': 'bytes' }
    })
  })

const streamMovie = (db: DrizzleDatabase) =>
  Effect.gen(function* () {
    const params = yield* HttpRouter.params
    const id = parseInt(params.id ?? '', 10)

    if (isNaN(id)) {
      return yield* jsonError(400, 'Invalid movie ID')
    }

    const [movie] = yield* internalTryPromise(() =>
      db.select().from(schema.movies).where(eq(schema.movies.id, id)).limit(1)
    )

    if (!movie) {
      return yield* jsonError(404, 'Movie not found')
    }

    return yield* streamVideoFile(movie.filePath)
  })

const streamEpisode = (db: DrizzleDatabase) =>
  Effect.gen(function* () {
    const params = yield* HttpRouter.params
    const id = parseInt(params.id ?? '', 10)

    if (isNaN(id)) {
      return yield* jsonError(400, 'Invalid episode ID')
    }

    const [episode] = yield* internalTryPromise(() =>
      db
        .select()
        .from(schema.episodes)
        .where(eq(schema.episodes.id, id))
        .limit(1)
    )

    if (!episode) {
      return yield* jsonError(404, 'Episode not found')
    }

    return yield* streamVideoFile(episode.filePath)
  })

const withWireErrors = <R>(
  effect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    InternalError | Unauthorized,
    R
  >
) =>
  effect.pipe(
    Effect.catchTags({
      InternalError: (error) => jsonError(500, error.message),
      Unauthorized: (error) => jsonError(401, error.message)
    })
  )

// GET /api/stream/:id and /api/stream/episode/:id — raw routes because
// streaming bodies have no schema. The static `episode` segment wins over
// the `:id` param, so registration order doesn't matter.
export const videoStreamRoutesLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const db = yield* Database
    const lastSweepAtRef = yield* Ref.make(0)

    const requireSession = makeSessionCheck(db, lastSweepAtRef)

    yield* router.get(
      '/api/stream/episode/:id',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          return yield* streamEpisode(db)
        })
      )
    )

    yield* router.get(
      '/api/stream/:id',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          return yield* streamMovie(db)
        })
      )
    )
  })
)
