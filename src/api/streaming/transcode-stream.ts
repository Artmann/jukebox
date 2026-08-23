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
  findSeekStart,
  getSession,
  resolveFile,
  startTranscode,
  waitForPath,
  waitForPlaylistContent
} from '../../services/transcoder'
import { InternalError, Unauthorized } from '../contract/errors'
import { internalTryPromise } from '../handlers/support'
import { makeSessionCheck } from '../middleware/session'

const jsonError = (status: number, message: string) =>
  HttpServerResponse.json({ error: { message } }, { status }).pipe(Effect.orDie)

const fallbackMessage =
  "Couldn't prepare this file for casting. Check that ffmpeg is installed."

const invalidStartMessage =
  "Couldn't start playback at that position. Reload the page and try again."

// A transcode only produces output forward from where it started, so seeking
// past the transcode head means starting a new conversion at the seek
// position. The offset lives in the path rather than a query string because
// the playlists reference `media.m3u8` and `segment-N.ts` relatively, and
// relative resolution drops the query — a path prefix keeps every asset of one
// session under the same URL prefix with no playlist rewriting.
function parseStartSeconds(raw: string): number | null {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

const startSecondsFromParams = Effect.gen(function* () {
  const params = yield* HttpRouter.params

  return parseStartSeconds(params.start ?? '')
})

// The transcode routes identify the profile from the x-jukebox-profile-id
// header (set by the casting player) rather than the profile cookie, like
// the Hono routes did.
const profileIdFromHeader = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const raw = request.headers['x-jukebox-profile-id'] ?? '0'
  const parsed = parseInt(raw, 10)

  return isNaN(parsed) ? 0 : parsed
})

// GET /api/transcode/:fileId/index.m3u8 (and the /at/:start/ variant) —
// starts (or reuses) an HLS transcode session beginning at `startSeconds` and
// answers with the master playlist once it's ready.
const servePlaylist = (startSeconds: number) =>
  Effect.gen(function* () {
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
          profileId,
          startSeconds
        })

        session.lastAccessedAt = Date.now()

        await session.readyPromise

        return session
      }
    }).pipe(Effect.either)

    if (outcome._tag === 'Left') {
      return yield* jsonError(500, outcome.left.message)
    }

    // Mediabunny's HLS muxer rewrites the master playlist (truncate + rewrite)
    // on every new segment, same as it does for media.m3u8, so its content —
    // not just its existence — needs to be polled for: a GET landing in the
    // truncate-to-refill window would otherwise get an empty file streamed
    // straight to the client.
    const content = yield* internalTryPromise(() =>
      waitForPlaylistContent(outcome.right.playlistPath, 15_000, 100)
    )

    if (content === null) {
      return yield* jsonError(500, fallbackMessage)
    }

    return HttpServerResponse.text(content, {
      contentType: 'application/vnd.apple.mpegurl',
      headers: { 'cache-control': 'no-store' }
    })
  })

// The master playlist served at index.m3u8 references a per-rendition
// media playlist (see getPlaylistPath in transcoder.ts) in addition to
// segments, so this route serves both asset kinds.
const segmentContentType = 'video/mp2t'
const playlistContentType = 'application/vnd.apple.mpegurl'

function assetContentType(asset: string): string | null {
  if (/^segment-\d+\.ts$/.test(asset)) {
    return segmentContentType
  }

  if (asset === 'media.m3u8') {
    return playlistContentType
  }

  return null
}

// GET /api/transcode/:fileId/:segment (and the /at/:start/ variant) — serves
// one HLS segment or the media playlist, waiting briefly for it to be produced
// if needed.
const serveSegment = (startSeconds: number) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const params = yield* HttpRouter.params
    const fileId = params.fileId ?? ''
    const segment = params.segment ?? ''
    const profileId = yield* profileIdFromHeader

    const session = getSession(fileId, profileId)

    if (!session || session.startSeconds !== startSeconds) {
      console.warn(
        `[transcode] Session not found for fileId=${fileId} profileId=${profileId} start=${startSeconds} segment=${segment}`
      )

      return yield* jsonError(404, 'Transcode session not found')
    }

    // Basic safety: only allow known segment/playlist filenames.
    const contentType = assetContentType(segment)

    if (!contentType) {
      return yield* jsonError(400, 'Invalid segment')
    }

    const segmentPath = path.join(session.tempDir, segment)

    // The media playlist is rewritten (truncated + rewritten + closed) on
    // every new segment for the lifetime of a "live" conversion, so its
    // content — not just its existence — needs to be polled for: a GET
    // landing in the truncate-to-refill window would otherwise get an empty
    // (or partial) file. Segment files are written once and never revisited,
    // so existence alone is enough for those.
    if (contentType === playlistContentType) {
      const content = yield* internalTryPromise(() =>
        waitForPlaylistContent(segmentPath, 15_000, 100)
      )

      if (content === null) {
        console.warn(
          `[transcode] Playlist not ready after 15s: fileId=${fileId} profileId=${profileId}`
        )

        return yield* jsonError(404, 'Playlist not ready')
      }

      session.lastAccessedAt = Date.now()

      return HttpServerResponse.text(content, {
        contentType,
        headers: { 'cache-control': 'no-store' }
      })
    }

    // Wait briefly for the asset to appear if the conversion hasn't produced
    // it yet.
    const ready = yield* internalTryPromise(() =>
      waitForPath(segmentPath, 15_000, 200)
    )

    if (!ready) {
      console.warn(
        `[transcode] Segment not ready after 15s: fileId=${fileId} profileId=${profileId} segment=${segment}`
      )

      return yield* jsonError(404, 'Segment not ready')
    }

    session.lastAccessedAt = Date.now()

    // No Content-Length: Mediabunny's HLS writer keeps a single file handle
    // open and writes to it in place for the lifetime of a "live" conversion
    // (a segment file itself can still be mid-write the moment it first
    // appears on disk). A Content-Length computed from a stat() taken before
    // streaming can promise more bytes than the read stream ends up
    // delivering, which makes the HTTP response hang instead of failing
    // cleanly. Chunked transfer (matching servePlaylist above) sidesteps that
    // race entirely.
    return HttpServerResponse.stream(fileSystem.stream(segmentPath), {
      contentType,
      headers: { 'cache-control': 'no-store' }
    })
  })


// GET /api/transcode/:fileId/seek/:time — the position a seek to `time`
// would actually start at. Stream-copied video can only begin at a keyframe,
// so the client asks here first and builds its timeline offset from the
// answer; requesting a playlist at a non-keyframe position would leave the
// timeline up to one GOP off.
const serveSeekStart = (targetSeconds: number) =>
  Effect.gen(function* () {
    const params = yield* HttpRouter.params
    const fileId = params.fileId ?? ''

    const resolved = yield* internalTryPromise(() => resolveFile(fileId))

    if (!resolved) {
      return yield* jsonError(404, 'File not found')
    }

    const startSeconds = yield* internalTryPromise(() =>
      findSeekStart(resolved.filePath, targetSeconds)
    )

    return yield* HttpServerResponse.json({ startSeconds }).pipe(Effect.orDie)
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

    // The offset-less routes are the same thing as /at/0/ — kept so casting
    // and any already-issued URL keep working.
    yield* router.get(
      '/api/transcode/:fileId/index.m3u8',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          return yield* servePlaylist(0)
        })
      )
    )

    yield* router.get(
      '/api/transcode/:fileId/seek/:time',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          const params = yield* HttpRouter.params
          const targetSeconds = parseStartSeconds(params.time ?? '')

          if (targetSeconds === null) {
            return yield* jsonError(400, invalidStartMessage)
          }

          return yield* serveSeekStart(targetSeconds)
        })
      )
    )

    yield* router.get(
      '/api/transcode/:fileId/at/:start/index.m3u8',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          const startSeconds = yield* startSecondsFromParams

          if (startSeconds === null) {
            return yield* jsonError(400, invalidStartMessage)
          }

          return yield* servePlaylist(startSeconds)
        })
      )
    )

    yield* router.get(
      '/api/transcode/:fileId/at/:start/:segment',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          const startSeconds = yield* startSecondsFromParams

          if (startSeconds === null) {
            return yield* jsonError(400, invalidStartMessage)
          }

          return yield* serveSegment(startSeconds)
        })
      )
    )

    yield* router.get(
      '/api/transcode/:fileId/:segment',
      withWireErrors(
        Effect.gen(function* () {
          yield* requireSession

          return yield* serveSegment(0)
        })
      )
    )
  })
)
