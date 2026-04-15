import { spawn, type ChildProcess } from 'child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import invariant from 'tiny-invariant'
import { db, schema } from '../../database'

const logger = {
  error: (...args: unknown[]) => console.error('[transcode]', ...args),
  info: (...args: unknown[]) => console.info('[transcode]', ...args),
  warn: (...args: unknown[]) => console.warn('[transcode]', ...args)
}

const reapIdleMs = 30 * 60 * 1000
const reaperIntervalMs = 5 * 60 * 1000

interface TranscodeSession {
  fileId: string
  ffmpegProcess: ChildProcess | null
  lastAccessedAt: number
  playlistPath: string
  tempDir: string
  readyPromise: Promise<void>
}

const sessions = new Map<string, TranscodeSession>()

function sessionKey(fileId: string, profileId: number): string {
  return `${fileId}:${profileId}`
}

function safeDirectoryName(fileId: string, profileId: number): string {
  return `${fileId}__${profileId}`
}

function getTranscodeRoot(): string {
  return path.join(os.tmpdir(), 'jukebox-transcode')
}

function waitForPlaylist(playlistPath: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const check = () => {
      if (existsSync(playlistPath)) {
        resolve()

        return
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(
          new Error(
            "Couldn't prepare this file for casting. Check that ffmpeg is installed."
          )
        )

        return
      }

      setTimeout(check, 200)
    }

    check()
  })
}

export interface StartTranscodeOptions {
  fileId: string
  filePath: string
  profileId: number
  spawnImplementation?: typeof spawn
}

export function startTranscode({
  fileId,
  filePath,
  profileId,
  spawnImplementation
}: StartTranscodeOptions): TranscodeSession {
  const key = sessionKey(fileId, profileId)
  const existing = sessions.get(key)

  if (existing) {
    existing.lastAccessedAt = Date.now()

    return existing
  }

  const tempDir = path.join(
    getTranscodeRoot(),
    safeDirectoryName(fileId, profileId)
  )

  mkdirSync(tempDir, { recursive: true })

  const playlistPath = path.join(tempDir, 'index.m3u8')
  const segmentPattern = path.join(tempDir, 'segment-%03d.ts')

  const args = [
    '-i',
    filePath,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-f',
    'hls',
    '-hls_time',
    '6',
    '-hls_list_size',
    '0',
    '-hls_segment_filename',
    segmentPattern,
    playlistPath
  ]

  const spawner = spawnImplementation ?? spawn

  let ffmpegProcess: ChildProcess | null = null

  try {
    ffmpegProcess = spawner('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    logger.error(`Failed to spawn ffmpeg for ${fileId}:`, error)

    throw new Error(
      "Couldn't prepare this file for casting. Check that ffmpeg is installed."
    )
  }

  invariant(ffmpegProcess, 'ffmpeg process should exist after spawn')

  ffmpegProcess.on('error', (error) => {
    logger.error(`ffmpeg process error for ${fileId}:`, error)
  })

  ffmpegProcess.on('exit', (code) => {
    logger.info(`ffmpeg exited for ${fileId} with code ${code}`)
  })

  const readyPromise = waitForPlaylist(playlistPath, 30000)

  const session: TranscodeSession = {
    fileId,
    ffmpegProcess,
    lastAccessedAt: Date.now(),
    playlistPath,
    tempDir,
    readyPromise
  }

  sessions.set(key, session)

  return session
}

export function stopSession(key: string): void {
  const session = sessions.get(key)

  if (!session) {
    return
  }

  if (session.ffmpegProcess && session.ffmpegProcess.exitCode === null) {
    try {
      session.ffmpegProcess.kill('SIGTERM')
    } catch (error) {
      logger.warn(`Failed to kill ffmpeg for ${session.fileId}:`, error)
    }
  }

  try {
    rmSync(session.tempDir, { recursive: true, force: true })
  } catch (error) {
    logger.warn(`Failed to remove temp dir ${session.tempDir}:`, error)
  }

  sessions.delete(key)
}

export function reapIdleSessions(now: number = Date.now()): void {
  for (const [key, session] of sessions.entries()) {
    if (now - session.lastAccessedAt > reapIdleMs) {
      logger.info(`Reaping idle transcode session ${key}`)

      stopSession(key)
    }
  }
}

if (typeof setInterval !== 'undefined' && process.env.NODE_ENV !== 'test') {
  setInterval(() => reapIdleSessions(), reaperIntervalMs).unref?.()
}

async function resolveFile(
  fileId: string
): Promise<{ filePath: string } | null> {
  if (fileId.startsWith('episode-')) {
    const episodeId = parseInt(fileId.slice('episode-'.length), 10)

    if (isNaN(episodeId)) {
      return null
    }

    const [episode] = await db
      .select()
      .from(schema.episodes)
      .where(eq(schema.episodes.id, episodeId))
      .limit(1)

    if (!episode) {
      return null
    }

    return { filePath: episode.filePath }
  }

  if (fileId.startsWith('movie-')) {
    const movieId = parseInt(fileId.slice('movie-'.length), 10)

    if (isNaN(movieId)) {
      return null
    }

    const [movie] = await db
      .select()
      .from(schema.movies)
      .where(eq(schema.movies.id, movieId))
      .limit(1)

    if (!movie) {
      return null
    }

    return { filePath: movie.filePath }
  }

  return null
}

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
  const key = sessionKey(fileId, isNaN(profileId) ? 0 : profileId)

  const session = sessions.get(key)

  if (!session) {
    return context.json({ error: { message: 'Transcode session not found' } }, 404)
  }

  // Basic safety: only allow .ts files with our segment prefix.
  if (!/^segment-\d+\.ts$/.test(segment)) {
    return context.json({ error: { message: 'Invalid segment' } }, 400)
  }

  const segmentPath = path.join(session.tempDir, segment)

  // Wait briefly for the segment to appear if ffmpeg hasn't produced it yet.
  const startedAt = Date.now()

  while (!existsSync(segmentPath) && Date.now() - startedAt < 15000) {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  if (!existsSync(segmentPath)) {
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

// Test-only helpers.
export function _clearSessions(): void {
  for (const key of Array.from(sessions.keys())) {
    stopSession(key)
  }
}

export function _listSessionKeys(): string[] {
  return Array.from(sessions.keys())
}

// Ensure stale temp dirs from previous runs are cleaned on boot.
try {
  const root = getTranscodeRoot()

  if (existsSync(root)) {
    for (const entry of readdirSync(root)) {
      rmSync(path.join(root, entry), { recursive: true, force: true })
    }
  }
} catch (error) {
  logger.warn('Failed to clear transcode root on boot:', error)
}

export { transcodeRoutes }
