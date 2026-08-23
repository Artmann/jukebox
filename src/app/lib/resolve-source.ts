import { ALL_FORMATS, Input, UrlSource } from 'mediabunny'

export interface ResolvedSource {
  // The probed, full-file duration. Null when the player can read the real
  // duration itself, or when probing failed.
  duration: number | null
  // Set only for transcoded sources — it's what the transcode URLs are built
  // from, including the ones a seek restarts at.
  fileId: string | null
  isTranscoded: boolean
  src: string
  type: string
}

const hlsContentType = 'application/vnd.apple.mpegurl'

function isSafari(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent

  return /^((?!chrome|android|crios|fxios).)*safari/i.test(userAgent)
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// Checks whether the current browser can natively decode the source's audio
// track, and reads the file's real duration from its container metadata.
// Both come from the same probe so we only pay for one network round-trip.
// audioRequiresTranscode returns true (needs transcode) whenever we can't
// positively confirm decodability — a silently unplayable audio track is
// worse than an unnecessary transcode. duration falls back to null on any
// probe failure.
async function probeSource(
  src: string
): Promise<{ audioRequiresTranscode: boolean; duration: number | null }> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(src) })

  try {
    const [audioTrack, duration] = await Promise.all([
      input.getPrimaryAudioTrack(),
      input.getDurationFromMetadata().catch(() => null)
    ])

    const audioRequiresTranscode = audioTrack
      ? !(await audioTrack.canDecode())
      : false

    return { audioRequiresTranscode, duration }
  } catch {
    return { audioRequiresTranscode: true, duration: null }
  } finally {
    input.dispose()
  }
}

/**
 * URL of a transcode session starting at an absolute position. The offset
 * lives in the path rather than a query string because the playlists reference
 * their media playlist and segments relatively, and relative resolution drops
 * the query.
 */
export function transcodeUrl(fileId: string, startSeconds: number): string {
  if (startSeconds <= 0) {
    return `/api/transcode/${fileId}/index.m3u8`
  }

  const start = Number(startSeconds.toFixed(3))

  return `/api/transcode/${fileId}/at/${start}/index.m3u8`
}

/**
 * Decides how a stream should be played, probing the file once. The result is
 * cached per source by the player, so restarting a transcode at a seek
 * position doesn't pay for another probe.
 */
export async function resolveSource(src: string): Promise<ResolvedSource> {
  const isMkv = /\.mkv(\?|$)/i.test(src)

  // Safari/iOS can't cast an MKV container over AirPlay, regardless of
  // whether its audio is otherwise browser-playable.
  const needsHlsForCasting = isMkv && (isSafari() || isIos())
  const { audioRequiresTranscode: needsHlsForAudio, duration } =
    await probeSource(src)

  if (needsHlsForCasting || needsHlsForAudio) {
    // /api/stream/:id or /api/stream/episode/:id -> /api/transcode/<key>/...
    const match = src.match(/\/api\/stream\/(?:episode\/)?(\d+)/)

    if (match) {
      const isEpisode = src.includes('/episode/')
      const id = match[1]
      const fileId = isEpisode ? `episode-${id}` : `movie-${id}`

      return {
        duration,
        fileId,
        isTranscoded: true,
        src: transcodeUrl(fileId, 0),
        type: hlsContentType
      }
    }
  }

  // Direct-play sources already show the correct duration from the container
  // itself — no override needed, and the byte-range server lets the browser
  // seek anywhere on its own.
  return {
    duration: null,
    fileId: null,
    isTranscoded: false,
    src,
    type: isMkv ? 'video/x-matroska' : 'video/mp4'
  }
}

/**
 * The source to hand video.js for a session starting at an absolute position.
 * Only a transcode has an offset; direct play is always the whole file.
 */
export function sourceForStart(
  resolved: ResolvedSource,
  startSeconds: number
): { src: string; type: string } {
  if (!resolved.isTranscoded || resolved.fileId === null) {
    return { src: resolved.src, type: resolved.type }
  }

  return {
    src: transcodeUrl(resolved.fileId, startSeconds),
    type: resolved.type
  }
}
