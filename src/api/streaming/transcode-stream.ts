import {
  FileSystem,
  HttpApiBuilder,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from '@effect/platform'
import { Effect, Ref } from 'effect'
import path from 'path'

import { Database } from '../../database/layer'
import {
  getSession,
  resolveFile,
  startTranscode,
  waitForPath
} from '../../services/transcoder'
import { InternalError, Unauthorized } from '../contract/errors'
import { internalTryPromise } from '../handlers/support'
import { makeSessionCheck } from '../middleware/session'

const jsonError = (status: number, message: string) =>
  HttpServerResponse.json({ error: { message } }, { status }).pipe(Effect.orDie)

const fallbackMessage =
  "Couldn't prepare this file for casting. Check that ffmpeg is installed."

// The transcode routes identify the profile from the x-jukebox-profile-id
// header (set by the casting player) rather than the profile cookie, like
// the Hono routes did.
const profileIdFromHeader = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const raw = request.headers['x-jukebox-profile-id'] ?? '0'
  const parsed = parseInt(raw, 10)

  return isNaN(parsed) ? 0 : parsed
})

// GET /api/transcode/:fileId/index.m3u8 — starts (or reuses) an ffmpeg HLS
// session and answers with the playlist once ffmpeg has produced it.
const servePlaylist = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const params = yield* HttpRouter.params
  const fileId = params.fileId ?? ''
  const profileId = yield* profileIdFromHeader

  const resolved = yield* internalTryPromise(() => resolveFile(fileId))

  if (!resolved) {
    return yield* jsonError(404, 'File not found')
  }

  const exists = yield* fileSystem
    .exists(resolved.filePath)
    .pipe(Effect.orElseSucceed(() => false))

  if (!exists) {
    return yield* jsonError(404, 'Video file not found')
  }

  const outcome = yield* Effect.tryPromise({
    catch: (error) =>
      new InternalError({
        message: error instanceof Error ? error.message : fallbackMessage
      }),
    try: async () => {
      const session = startTranscode({
        fileId,
        filePath: resolved.filePath,
        profileId
      })

      session.lastAccessedAt = Date.now()

      await session.readyPromise

      return session
    }
  }).pipe(Effect.either)

  if (outcome._tag === 'Left') {
    return yield* jsonError(500, outcome.left.message)
  }

  return HttpServerResponse.stream(
    fileSystem.stream(outcome.right.playlistPath),
    {
      contentType: 'application/vnd.apple.mpegurl',
      headers: { 'cache-control': 'no-store' }
    }
  )
})

// GET /api/transcode/:fileId/:segment — serves one HLS segment, waiting
// briefly for ffmpeg to produce it if needed.
const serveSegment = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const params = yield* HttpRouter.params
  const fileId = params.fileId ?? ''
  const segment = params.segment ?? ''
  const profileId = yield* profileIdFromHeader

  const session = getSession(fileId, profileId)

  if (!session) {
    return yield* jsonError(404, 'Transcode session not found')
  }

  // Basic safety: only allow .ts files with our segment prefix.
  if (!/^segment-\d+\.ts$/.test(segment)) {
    return yield* jsonError(400, 'Invalid segment')
  }

  const segmentPath = path.join(session.tempDir, segment)

  // Wait briefly for the segment to appear if ffmpeg hasn't produced it yet.
  const ready = yield* internalTryPromise(() =>
    waitForPath(segmentPath, 15_000, 200)
  )

  if (!ready) {
    return yield* jsonError(404, 'Segment not ready')
  }

  session.lastAccessedAt = Date.now()

  const stat = yield* fileSystem
    .stat(segmentPath)
    .pipe(
      Effect.mapError((error) => new InternalError({ message: error.message }))
    )

  return HttpServerResponse.stream(fileSystem.stream(segmentPath), {
    contentLength: Number(stat.size),
    contentType: 'video/mp2t',
    headers: { 'cache-control': 'no-store' }
  })
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

export const transcodeStreamRoutesLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const db = yield* Database
    const lastSweepAtRef = yield* Ref.make(0)

    const requireSession = makeSessionCheck(db, lastSweepAtRef)

    yield* router.get(
      '/api/transcode/:fileId/index.m3u8',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          return yield* servePlaylist
        })
      )
    )

    yield* router.get(
      '/api/transcode/:fileId/:segment',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          return yield* serveSegment
        })
      )
    )
  })
)
