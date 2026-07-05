import { createReadStream, existsSync, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'

import { Hono } from 'hono'

import {
  getSession,
  resolveFile,
  startTranscode,
  waitForPath
} from '../../services/transcoder'

// The session engine lives in src/services/transcoder.ts; these Hono routes
// remain only until the route tests migrate to the Effect web handler.
export {
  _clearSessions,
  _listSessionKeys,
  reapIdleSessions,
  startTranscode,
  type StartTranscodeOptions
} from '../../services/transcoder'

const transcodeRoutes = new Hono()

// GET /api/transcode/:fileId/index.m3u8
transcodeRoutes.get('/:fileId/index.m3u8', async (context) => {
  const fileId = context.req.param('fileId')
  const profileIdRaw = context.req.header('x-jukebox-profile-id') ?? '0'
  const profileId = parseInt(profileIdRaw, 10)

  const resolved = await resolveFile(fileId)

  if (!resolved) {
    return context.json({ error: { message: 'File not found' } }, 404)
  }

  if (!existsSync(resolved.filePath)) {
    return context.json({ error: { message: 'Video file not found' } }, 404)
  }

  try {
    const session = startTranscode({
      fileId,
      filePath: resolved.filePath,
      profileId: isNaN(profileId) ? 0 : profileId
    })

    session.lastAccessedAt = Date.now()

    await session.readyPromise

    const playlistStream = createReadStream(session.playlistPath)
    const webStream = Readable.toWeb(playlistStream) as ReadableStream

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Couldn't prepare this file for casting. Check that ffmpeg is installed."

    return context.json({ error: { message } }, 500)
  }
})

// GET /api/transcode/:fileId/:segment
transcodeRoutes.get('/:fileId/:segment', async (context) => {
  const fileId = context.req.param('fileId')
  const segment = context.req.param('segment')
  const profileIdRaw = context.req.header('x-jukebox-profile-id') ?? '0'
  const profileId = parseInt(profileIdRaw, 10)

  const session = getSession(fileId, isNaN(profileId) ? 0 : profileId)

  if (!session) {
    return context.json(
      { error: { message: 'Transcode session not found' } },
      404
    )
  }

  // Basic safety: only allow .ts files with our segment prefix.
  if (!/^segment-\d+\.ts$/.test(segment)) {
    return context.json({ error: { message: 'Invalid segment' } }, 400)
  }

  const segmentPath = path.join(session.tempDir, segment)

  // Wait briefly for the segment to appear if ffmpeg hasn't produced it yet.
  const ready = await waitForPath(segmentPath, 15_000, 200)

  if (!ready) {
    return context.json({ error: { message: 'Segment not ready' } }, 404)
  }

  session.lastAccessedAt = Date.now()

  const size = statSync(segmentPath).size
  const nodeStream = createReadStream(segmentPath)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream

  return new Response(webStream, {
    headers: {
      'Content-Type': 'video/mp2t',
      'Content-Length': String(size),
      'Cache-Control': 'no-store'
    }
  })
})

export { transcodeRoutes }
