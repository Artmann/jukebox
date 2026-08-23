import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

import { registerMediabunnyServer } from '@mediabunny/server'
import { eq } from 'drizzle-orm'
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  Conversion,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FilePathSource,
  FilePathTarget,
  HlsOutputFormat,
  Input,
  MpegTsOutputFormat,
  Output,
  PathedTarget,
  QUALITY_HIGH
} from 'mediabunny'
import invariant from 'tiny-invariant'

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
  startSeconds: number
  tempDir: string
  readyPromise: Promise<void>
}

const sessions = new Map<string, TranscodeSession>()

function sessionKey(fileId: string, profileId: number): string {
  return `${fileId}:${profileId}`
}

// The offset is part of the directory name so segments left behind by a
// previous start position can never be served for the current one — the
// segment numbering restarts at 0 for every new offset.
function safeDirectoryName(
  fileId: string,
  profileId: number,
  startSeconds: number
): string {
  return `${fileId}__${profileId}__${Math.round(startSeconds * 1000)}`
}

// Vitest runs test files in parallel worker processes, each of which imports
// this module and runs the boot cleanup below. Sharing one root would let a
// worker delete another worker's live session directories mid-test, so give
// each test process its own root. It stays nested under the production root so
// a real server boot still sweeps anything the tests leave behind.
function getTranscodeRoot(): string {
  const root = path.join(os.tmpdir(), 'jukebox-transcode')

  if (process.env.VITEST) {
    return path.join(root, `test-${process.pid}`)
  }

  return root
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
  startSeconds: number
  tempDir: string
}) => ConversionHandle

// Both conversion paths mux the same live HLS layout into tempDir.
function createHlsOutput(tempDir: string): Output {
  return new Output({
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
}

// From-the-start conversion. Video is stream-copied and audio is re-encoded
// to AAC, matching the ffmpeg invocation this replaces
// (`-c:v copy -c:a aac -ac 2`). Only the primary audio track is kept —
// multi-track files previously relied on ffmpeg's default stream ordering,
// which picked the same track.
function runFullConversion({
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
      const output = createHlsOutput(tempDir)

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

/**
 * The keyframe timestamp a seek to `targetSeconds` actually starts at.
 * Stream-copied video can only begin at a keyframe, so the client asks for
 * this first and builds its timeline offset from the answer — otherwise the
 * timeline would silently be up to one GOP (~6s) off after every seek.
 * Falls back to 0 (a plain from-the-start session) when the target lands
 * before the first keyframe.
 */
export async function findSeekStart(
  filePath: string,
  targetSeconds: number
): Promise<number> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new FilePathSource(filePath)
  })

  try {
    const videoTrack = await input.getPrimaryVideoTrack()

    if (!videoTrack) {
      return targetSeconds
    }

    const sink = new EncodedPacketSink(videoTrack)
    const keyPacket = await sink.getKeyPacket(targetSeconds, {
      verifyKeyPackets: true
    })

    return keyPacket?.timestamp ?? 0
  } finally {
    input.dispose()
  }
}

// Mid-file conversion for seeking. Mediabunny's Conversion refuses to
// stream-copy video when `trim.start` is past the first packet (it forces a
// full video re-encode, which is slow everywhere and simply fails on
// machines whose hardware encoder node-av can't open — the bug this path
// fixes). Instead, copy the encoded video packets ourselves starting at the
// keyframe at-or-before `startSeconds`, and re-encode only the audio — the
// exact work the from-the-start conversion already does.
function runTrimmedCopyConversion({
  filePath,
  startSeconds,
  tempDir
}: {
  filePath: string
  startSeconds: number
  tempDir: string
}): ConversionHandle {
  let canceled = false
  let output: Output | null = null

  const promise = (async () => {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new FilePathSource(filePath)
    })

    try {
      const videoTrack = await input.getPrimaryVideoTrack()
      const audioTrack = await input.getPrimaryAudioTrack()

      invariant(videoTrack, 'Cannot seek within a file that has no video track.')

      const videoCodec = videoTrack.codec

      invariant(
        videoCodec,
        'Cannot seek within a file whose video codec is unknown.'
      )

      const videoSink = new EncodedPacketSink(videoTrack)
      const startPacket =
        (await videoSink.getKeyPacket(startSeconds, {
          verifyKeyPackets: true
        })) ?? (await videoSink.getFirstPacket({ verifyKeyPackets: true }))

      invariant(
        startPacket,
        'Cannot seek within a file that has no video keyframes.'
      )

      // The presentation timeline of this session starts at the keyframe,
      // not at the requested position — findSeekStart tells the client the
      // same timestamp, so both sides agree on the offset.
      const trimStart = startPacket.timestamp

      const hlsOutput = createHlsOutput(tempDir)

      output = hlsOutput

      invariant(
        hlsOutput.format.getSupportedVideoCodecs().includes(videoCodec),
        `The video codec (${videoCodec}) can't be stream-copied into MPEG-TS.`
      )

      const videoSource = new EncodedVideoPacketSource(videoCodec)

      hlsOutput.addVideoTrack(videoSource)

      const canDecodeAudio = audioTrack ? await audioTrack.canDecode() : false
      const audioSource = canDecodeAudio
        // The encoded channel count follows the decoded samples -
        // AudioEncodingConfig has no channel override.
        ? new AudioSampleSource({ bitrate: QUALITY_HIGH, codec: 'aac' })
        : null

      if (audioSource) {
        hlsOutput.addAudioTrack(audioSource)
      }

      await hlsOutput.start()

      const copyVideo = async () => {
        const decoderConfig = await videoTrack.getDecoderConfig()
        const meta = { decoderConfig: decoderConfig ?? undefined }

        for await (const packet of videoSink.packets(startPacket, undefined, {
          verifyKeyPackets: true
        })) {
          if (canceled) {
            return
          }

          // Open-GOP leading frames: packets after the keyframe in decode
          // order can still present before it, referencing frames this
          // session never includes. Drop them, like ffmpeg does on -ss.
          if (packet.timestamp < trimStart) {
            continue
          }

          await videoSource.add(
            packet.clone({ timestamp: packet.timestamp - trimStart }),
            meta
          )
        }

        videoSource.close()
      }

      const copyAudio = async () => {
        if (!audioSource || !audioTrack) {
          return
        }

        const audioSink = new AudioSampleSink(audioTrack)

        for await (const decoded of audioSink.samples(trimStart)) {
          if (canceled) {
            decoded.close()

            return
          }

          let sample = decoded

          // The first decoded sample can begin before the keyframe. Trim it
          // so the audio timeline starts exactly with the video.
          if (sample.timestamp < trimStart) {
            const startFrame = Math.round(
              (trimStart - sample.timestamp) * sample.sampleRate
            )
            const trimmed = sample.trim(
              Math.min(startFrame, sample.numberOfFrames)
            )

            sample.close()

            if (trimmed.numberOfFrames === 0) {
              trimmed.close()

              continue
            }

            sample = trimmed
          }

          sample.setTimestamp(Math.max(0, sample.timestamp - trimStart))

          await audioSource.add(sample)
          sample.close()
        }

        audioSource.close()
      }

      await Promise.all([copyVideo(), copyAudio()])

      if (canceled) {
        return
      }

      await hlsOutput.finalize()
    } catch (error) {
      // Cancellation tears the output down mid-write; the pumps then fail
      // with errors that aren't the conversion's fault.
      if (!canceled) {
        throw error
      }
    } finally {
      input.dispose()
    }
  })()

  return {
    promise,
    cancel: async () => {
      canceled = true

      if (
        output &&
        output.state !== 'finalizing' &&
        output.state !== 'finalized' &&
        output.state !== 'canceled'
      ) {
        await output.cancel()
      }
    }
  }
}

export function runMediabunnyConversion({
  filePath,
  startSeconds,
  tempDir
}: {
  filePath: string
  startSeconds: number
  tempDir: string
}): ConversionHandle {
  if (startSeconds > 0) {
    return runTrimmedCopyConversion({ filePath, startSeconds, tempDir })
  }

  return runFullConversion({ filePath, tempDir })
}

export interface StartTranscodeOptions {
  fileId: string
  filePath: string
  profileId: number
  runConversion?: ConversionRunner
  startSeconds?: number
}

export function startTranscode({
  fileId,
  filePath,
  profileId,
  runConversion,
  startSeconds = 0
}: StartTranscodeOptions): TranscodeSession {
  const key = sessionKey(fileId, profileId)
  const existing = sessions.get(key)

  if (existing) {
    if (existing.startSeconds === startSeconds) {
      existing.lastAccessedAt = Date.now()

      return existing
    }

    // The viewer seeked. One conversion per viewer and file: cancel the old
    // one instead of leaving it running, or every seek would leave another
    // conversion burning CPU for output nobody will request again.
    logger.info(
      `Restarting transcode for ${key} at ${startSeconds}s (was ${existing.startSeconds}s)`
    )

    stopSession(key)
  }

  const tempDir = path.join(
    getTranscodeRoot(),
    safeDirectoryName(fileId, profileId, startSeconds)
  )

  mkdirSync(tempDir, { recursive: true })

  const playlistPath = path.join(tempDir, 'index.m3u8')

  const conversionRunner = runConversion ?? runMediabunnyConversion
  const { promise: conversionPromise, cancel } = conversionRunner({
    filePath,
    startSeconds,
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
    startSeconds,
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
