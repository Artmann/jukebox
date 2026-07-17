// @vitest-environment node

// Regression tests for two races found in the Mediabunny live-HLS transcode
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
import { writeFileSync } from 'fs'
import path from 'path'

import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { Layer } from 'effect'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()

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
