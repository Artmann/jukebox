import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

import { eq } from 'drizzle-orm'

import { db, schema } from '../database'

// HLS transcode session engine, extracted from src/api/routes/transcode.ts
// so the Effect raw routes and the legacy Hono routes share one session map.
// Becomes a scoped Effect service (Command executor, Scope-per-session) in
// Phase 5.

const logger = {
  error: (...args: unknown[]) => console.error('[transcode]', ...args),
  info: (...args: unknown[]) => console.info('[transcode]', ...args),
  warn: (...args: unknown[]) => console.warn('[transcode]', ...args)
}

export function waitForPath(
  filePath: string,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<boolean> {
  if (existsSync(filePath)) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const startedAt = Date.now()

    const interval = setInterval(() => {
      if (existsSync(filePath)) {
        clearInterval(interval)
        resolve(true)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(interval)
        resolve(false)
      }
    }, pollIntervalMs)
  })
}

const reapIdleMs = 30 * 60 * 1000
const reaperIntervalMs = 5 * 60 * 1000

export interface TranscodeSession {
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

function waitForPlaylist(
  playlistPath: string,
  timeoutMs: number
): Promise<void> {
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

export function getSession(
  fileId: string,
  profileId: number
): TranscodeSession | undefined {
  return sessions.get(sessionKey(fileId, profileId))
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

  let ffmpegProcess: ChildProcess
  try {
    ffmpegProcess = spawner('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    logger.error(`Failed to spawn ffmpeg for ${fileId}:`, error)

    throw new Error(
      "Couldn't prepare this file for casting. Check that ffmpeg is installed.",
      { cause: error }
    )
  }

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

function stopSession(key: string): void {
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

function reapIdleSessions(now: number = Date.now()): void {
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

export async function resolveFile(
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
