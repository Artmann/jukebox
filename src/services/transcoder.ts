import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

import { registerMediabunnyServer } from '@mediabunny/server'
import { eq } from 'drizzle-orm'
import {
  ALL_FORMATS,
  Conversion,
  FilePathSource,
  FilePathTarget,
  HlsOutputFormat,
  Input,
  MpegTsOutputFormat,
  Output,
  PathedTarget
} from 'mediabunny'

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

registerMediabunnyServer()

const castingErrorMessage =
  "Couldn't prepare this file for casting. Check that ffmpeg is installed."

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

// Mediabunny's HLS muxer rewrites the media playlist by opening a brand new
// FilePathTarget (truncate + rewrite + close) on every new segment, for the
// lifetime of a "live" conversion. A GET landing in that truncate-to-refill
// window sees a 0-byte (or, more rarely, partially written) file. Since the
// whole playlist is written in a single positional write() call, the file is
// either empty, mid-write, or a complete, valid playlist — never a stale-but-
// parseable one — so polling until it starts with #EXTM3U is enough to dodge
// the race without needing to patch Mediabunny itself.
export function waitForPlaylistContent(
  filePath: string,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<string | null> {
  const read = (): string | null => {
    try {
      const content = readFileSync(filePath, 'utf8')

      return content.startsWith('#EXTM3U') ? content : null
    } catch {
      return null
    }
  }

  const immediate = read()

  if (immediate !== null) {
    return Promise.resolve(immediate)
  }

  return new Promise((resolve) => {
    const startedAt = Date.now()

    const interval = setInterval(() => {
      const content = read()

      if (content !== null) {
        clearInterval(interval)
        resolve(content)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(interval)
        resolve(null)
      }
    }, pollIntervalMs)
  })
}

const reapIdleMs = 30 * 60 * 1000
const reaperIntervalMs = 5 * 60 * 1000

export interface TranscodeSession {
  fileId: string
  cancel: () => Promise<void>
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
        reject(new Error(castingErrorMessage))

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

export interface ConversionHandle {
  cancel: () => Promise<void>
  promise: Promise<void>
}

export type ConversionRunner = (options: {
  filePath: string
  tempDir: string
}) => ConversionHandle

// Video is stream-copied and audio is re-encoded to AAC, matching the
// ffmpeg invocation this replaces (`-c:v copy -c:a aac -ac 2`). Only the
// primary audio track is kept — multi-track files previously relied on
// ffmpeg's default stream ordering, which picked the same track.
export function runMediabunnyConversion({
  filePath,
  tempDir
}: {
  filePath: string
  tempDir: string
}): ConversionHandle {
  let conversion: Conversion | null = null
  let canceledBeforeInit = false

  const promise = (async () => {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new FilePathSource(filePath)
    })

    try {
      const output = new Output({
        format: new HlsOutputFormat({
          segmentFormat: new MpegTsOutputFormat(),
          targetDuration: 6,
          live: true,
          // `index.m3u8` (the root/target path) is always a master
          // playlist under Mediabunny — unlike ffmpeg's flat single-
          // playlist `-f hls` output. Pin the (single, since we only ever
          // convert one rendition) media playlist to a predictable name so
          // transcode-stream.ts can recognize and serve it alongside
          // segments.
          getPlaylistPath: () => 'media.m3u8',
          getSegmentPath: ({ n }) => `segment-${n}.ts`
        }),
        target: new PathedTarget(
          'index.m3u8',
          ({ path: relativePath }) =>
            new FilePathTarget(path.join(tempDir, relativePath))
        )
      })

      conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: {},
        audio: { codec: 'aac', numberOfChannels: 2 }
      })

      if (canceledBeforeInit) {
        await conversion.cancel()

        return
      }

      await conversion.execute()
    } finally {
      input.dispose()
    }
  })()

  return {
    promise,
    cancel: async () => {
      canceledBeforeInit = true

      await conversion?.cancel()
    }
  }
}

export interface StartTranscodeOptions {
  fileId: string
  filePath: string
  profileId: number
  runConversion?: ConversionRunner
}

export function startTranscode({
  fileId,
  filePath,
  profileId,
  runConversion
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

  const conversionRunner = runConversion ?? runMediabunnyConversion
  const { promise: conversionPromise, cancel } = conversionRunner({
    filePath,
    tempDir
  })

  // Never resolves — only used to fail fast (instead of waiting out the
  // full playlist timeout) when the conversion itself errors.
  const conversionFailure = conversionPromise
    .catch((error) => {
      logger.error(`Mediabunny conversion failed for ${fileId}:`, error)

      throw new Error(castingErrorMessage, { cause: error })
    })
    .then(() => new Promise<void>(() => {}))

  const readyPromise = Promise.race([
    waitForPlaylist(playlistPath, 30000),
    conversionFailure
  ])

  const session: TranscodeSession = {
    fileId,
    cancel,
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

  session.cancel().catch((error) => {
    logger.warn(`Failed to cancel conversion for ${session.fileId}:`, error)
  })

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
