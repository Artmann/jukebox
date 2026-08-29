import { ALL_FORMATS, Input, UrlSource } from 'mediabunny'
import type { AudioCodec } from 'mediabunny'

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

// Audio codecs a media element can be trusted to decode during direct play.
// Safari could additionally direct-play ac3/eac3, but MKV already forces HLS
// there for AirPlay, so an eac3 MP4 on Safari transcodes unnecessarily — an
// accepted tradeoff to keep one list for every browser.
const directPlayableAudioCodecs = new Set<AudioCodec>([
  'aac',
  'flac',
  'mp3',
  'opus',
  'vorbis'
])

// Decided from the codec name alone — not WebCodecs — so it behaves
// identically in secure and insecure contexts (AudioDecoder doesn't exist
// over plain HTTP, and WebCodecs support differs from media element support
// anyway). null means mediabunny saw an audio track it couldn't identify —
// fail safe to transcoding. ulaw/alaw intentionally transcode: G.711 in
// MKV/MP4 isn't reliably media-element-playable.
export function audioCodecRequiresTranscode(codec: AudioCodec | null): boolean {
  if (codec === null) {
    return true
  }

  return !directPlayableAudioCodecs.has(codec) && !codec.startsWith('pcm-')
}

// Reads the source's audio codec and real duration from its container
// metadata. Both come from the same probe so we only pay for one network
// round-trip. audioRequiresTranscode is true whenever the codec isn't
// positively known to direct-play — a silently unplayable audio track is
// worse than an unnecessary transcode. A source with no audio track at all
// direct-plays: there is nothing to decode. duration falls back to null on
// any probe failure.
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
      ? audioCodecRequiresTranscode(await audioTrack.getCodec())
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
