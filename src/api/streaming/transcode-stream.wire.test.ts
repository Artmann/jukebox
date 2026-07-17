// @vitest-environment node

// Regression tests for races found in the Mediabunny live-HLS transcode
// pipeline (see transcoder.ts / transcode-stream.ts):
//
// 1. serveSegment used to compute Content-Length from a stat() taken before
//    streaming. Mediabunny's FilePathTarget writes segments positionally to a
//    single open file handle, so a stat() taken mid-write could promise more
//    bytes than the read stream goes on to deliver, hanging the response
//    instead of failing cleanly.
// 2. Mediabunny's HLS muxer rewrites media.m3u8 by opening a brand new
//    truncate-mode file handle on every new segment, for the entire lifetime
//    of a live conversion. A GET landing in that truncate-to-refill window
//    used to see an empty (0-byte) file, which is what produced the
//    "media could not be loaded" playback error.
// 3. The same truncate-then-rewrite happens to the master playlist
//    (index.m3u8) on every new segment, but servePlaylist only fixed #2 for
//    media.m3u8 — index.m3u8 was still streamed straight off disk with no
//    content validation, so it could hand video.js an empty master playlist
//    and produce a MEDIA_ERR_SRC_NOT_SUPPORTED / "no supported sources"
//    playback error.
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { eq } from 'drizzle-orm'
import { Layer } from 'effect'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()
const { db, schema } = testDatabase

vi.mock('../../database', () => ({
  db: testDatabase.db,
  schema: testDatabase.schema
}))

const { databaseTestLayer } = await import('../../database/layer')
const { apiLive, decodeErrorRemapLive, rawRoutesLive, scanServicesLive } =
  await import('../../http/app')
const { telemetryTestLayer } = await import('../../telemetry/test-layer')
const { _clearSessions, startTranscode } = await import(
  '../../services/transcoder'
)

const { dispose, handler } = HttpApiBuilder.toWebHandler(
  Layer.mergeAll(
    apiLive,
    rawRoutesLive,
    decodeErrorRemapLive,
    NodeHttpServer.layerContext
  ).pipe(
    Layer.provide(
      scanServicesLive.pipe(Layer.provide(databaseTestLayer(testDatabase.db)))
    ),
    Layer.provide(telemetryTestLayer),
    Layer.provide(databaseTestLayer(testDatabase.db))
  )
)

afterAll(async () => {
  await dispose()
})

afterEach(() => {
  _clearSessions()
})

function pendingConversion() {
  return {
    cancel: vi.fn(async () => {}),
    promise: new Promise<void>(() => {})
  }
}

function getAsset(fileId: string, asset: string) {
  return handler(
    new Request(`http://localhost/api/transcode/${fileId}/${asset}`)
  )
}

describe('GET /api/transcode/:fileId/:segment — media.m3u8', () => {
  it('waits out a truncate-then-rewrite and returns the rewritten content instead of an empty body', async () => {
    const session = startTranscode({
      fileId: 'playlist-race',
      filePath: '/tmp/whatever.mkv',
      profileId: 0,
      runConversion: pendingConversion
    })

    const playlistPath = path.join(session.tempDir, 'media.m3u8')
    const finalContent =
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6.0,\nsegment-1.ts\n'

    // Mediabunny's muxer opens the file in truncate mode for every rewrite,
    // so the file briefly exists but is empty mid-rewrite.
    writeFileSync(playlistPath, '')

    setTimeout(() => {
      writeFileSync(playlistPath, finalContent)
    }, 150)

    const response = await getAsset('playlist-race', 'media.m3u8')

    expect(response.status).toEqual(200)
    expect(response.headers.get('content-type')).toEqual(
      'application/vnd.apple.mpegurl'
    )
    expect(await response.text()).toEqual(finalContent)
  })
})

describe('GET /api/transcode/:fileId/index.m3u8', () => {
  it('waits out a truncate-then-rewrite and returns the rewritten content instead of an empty body', async () => {
    const workingDirectory = mkdtempSync(
      path.join(tmpdir(), 'jukebox-transcode-playlist-race-')
    )
    const filePath = path.join(workingDirectory, 'movie.mkv')

    writeFileSync(filePath, 'fake movie bytes')

    await db.insert(schema.movies).values({
      id: 900,
      title: 'Playlist Race Movie',
      filePath,
      fileName: 'movie.mkv',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    })

    try {
      // Pre-seed the session (with a conversion that never produces output on
      // its own) under the same key servePlaylist derives from the fileId, so
      // its call to startTranscode reuses this session instead of spawning a
      // real Mediabunny conversion.
      const session = startTranscode({
        fileId: 'movie-900',
        filePath,
        profileId: 0,
        runConversion: pendingConversion
      })

      const initialContent =
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia.m3u8\n'
      const finalContent =
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2\nmedia.m3u8\n'

      writeFileSync(session.playlistPath, initialContent)

      // Establish the session as already "ready" — mirrors a player that
      // already loaded the master playlist once and reconnects (e.g. a
      // reload) while the muxer is mid-rewrite for a later segment, rather
      // than the very first request racing the file's initial creation.
      await session.readyPromise

      // Mediabunny's muxer opens the file in truncate mode for every
      // rewrite, so the file briefly exists but is empty mid-rewrite. Fire
      // the request in the same tick as the truncate, before the delayed
      // rewrite below lands, to reproduce a GET landing inside that window.
      writeFileSync(session.playlistPath, '')

      setTimeout(() => {
        writeFileSync(session.playlistPath, finalContent)
      }, 150)

      const response = await getAsset('movie-900', 'index.m3u8')

      expect(response.status).toEqual(200)
      expect(response.headers.get('content-type')).toEqual(
        'application/vnd.apple.mpegurl'
      )
      expect(await response.text()).toEqual(finalContent)
    } finally {
      await db.delete(schema.movies).where(eq(schema.movies.id, 900))
      rmSync(workingDirectory, { recursive: true, force: true })
    }
  })
})

describe('GET /api/transcode/:fileId/:segment — segment-N.ts', () => {
  it('serves segment bytes without a Content-Length that could race a concurrent write', async () => {
    const session = startTranscode({
      fileId: 'segment-header',
      filePath: '/tmp/whatever.mkv',
      profileId: 0,
      runConversion: pendingConversion
    })

    const segmentContent = 'fake segment bytes'

    writeFileSync(path.join(session.tempDir, 'segment-1.ts'), segmentContent)

    const response = await getAsset('segment-header', 'segment-1.ts')

    expect(response.status).toEqual(200)
    expect(response.headers.get('content-type')).toEqual('video/mp2t')
    // No stat()-derived Content-Length: chunked transfer is what makes this
    // safe against a file that's still being written to when the response
    // starts, instead of hanging on a promised byte count the stream can't
    // deliver.
    expect(response.headers.get('content-length')).toBeNull()
    expect(await response.text()).toEqual(segmentContent)
  })
})
