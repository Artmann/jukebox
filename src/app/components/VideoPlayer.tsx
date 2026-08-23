import { ALL_FORMATS, Input, UrlSource } from 'mediabunny'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

import { Logger } from '../lib/logger'
import type { SubtitleTrack } from '../lib/media'
import { seekRestartFailedMessage } from '../lib/playback-timeline'

interface VideoPlayerProps {
  onReady?: (player: Player) => void
  onSourceResolved?: (source: ResolvedSource) => void
  poster?: string
  src: string
  startSeconds?: number
  subtitles?: ReadonlyArray<SubtitleTrack>
}

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

// How long a seek is given to produce playback before the viewer is told it
// didn't take. A restart has to spin up a fresh conversion and write its first
// segments, so it is much slower than a native seek.
const restartTimeoutMs = 20000

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

const logger = new Logger('video-player')

let playerInstanceCounter = 0

function handleVideoPlayerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  // The button's native activation already toggles playback — just keep
  // the page-level space hotkey from toggling it a second time.
  event.stopPropagation()
}

export function VideoPlayer({
  onReady,
  onSourceResolved,
  poster,
  src,
  startSeconds = 0,
  subtitles
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
  const onReadyRef = useRef(onReady)
  const onSourceResolvedRef = useRef(onSourceResolved)
  const initialPosterRef = useRef(poster)
  const durationOverrideRef = useRef<number | null>(null)
  // Probing is a network round-trip, so the result is kept per source prop and
  // reused for every restart of that source.
  const resolvedRef = useRef<{
    promise: Promise<ResolvedSource>
    src: string
  } | null>(null)
  const reportedSrcRef = useRef<string | null>(null)
  const appliedSrcRef = useRef<string | null>(null)

  useEffect(() => {
    onReadyRef.current = onReady
    onSourceResolvedRef.current = onSourceResolved
  }, [onReady, onSourceResolved])

  // Create the player once on mount and dispose on unmount. Source/poster
  // changes are handled by the effects below so the same player instance
  // survives episode transitions — consumers (Watch, VideoControls,
  // VolumeControl) keep the same reference and never see a disposed player.
  useEffect(() => {
    if (!videoRef.current) {
      return
    }

    const videoElement = document.createElement('video-js')

    videoElement.classList.add('vjs-big-play-centered')

    // Enable AirPlay on Safari/iOS.
    videoElement.setAttribute('x-webkit-airplay', 'allow')
    videoElement.setAttribute('airplay', 'allow')
    videoElement.setAttribute('playsinline', '')

    videoRef.current.appendChild(videoElement)

    const instanceId = ++playerInstanceCounter

    logger.info('instance', instanceId, 'created')

    // vhs.overrideNative is deliberately left at VHS's own default
    // (`!Safari && !iOS`). Chrome now claims native HLS support, so forcing
    // it off handed the transcode playlists to Chrome's native HLS engine,
    // which never re-reads the still-growing "live" playlist a running
    // transcode serves — playback stalled after the first segments, or died
    // with MEDIA_ERR_SRC_NOT_SUPPORTED. VHS polls the playlist properly.
    // Safari/iOS still get native playback, which is what exposes AirPlay.
    const player = videojs(
      videoElement,
      {
        controls: false,
        autoplay: true,
        fill: true,
        poster: initialPosterRef.current
      },
      () => {
        // StrictMode can dispose this instance before the ready callback
        // fires. Don't hand a disposed player to the parent.
        if (player.isDisposed()) return
        onReadyRef.current?.(player)
      }
    )

    playerRef.current = player

    player.on('error', () => {
      logger.error(
        'instance',
        instanceId,
        'error',
        player.error(),
        'disposed=',
        player.isDisposed()
      )
    })

    // Live-HLS transcode playlists never hint their total duration (see
    // resolveSource), so VHS derives it from segments written so far and it
    // grows wrong until playback ends. Re-assert the real, probed duration
    // every time the tech reports one. player.duration(seconds) only fires
    // this event when the value actually changes, so this settles instead
    // of looping.
    player.on('durationchange', () => {
      const override = durationOverrideRef.current

      if (override !== null && player.duration() !== override) {
        player.duration(override)
      }
    })

    return () => {
      logger.info('instance', instanceId, 'disposing')
      player.dispose()
      playerRef.current = null
      appliedSrcRef.current = null
      reportedSrcRef.current = null
    }
  }, [])

  // Sets the source, both on mount and whenever the stream or the position the
  // session starts at changes. A changed `startSeconds` with an unchanged
  // `src` is a seek out of reach of the running transcode: the conversion
  // restarts at that position, and the player's own timeline starts over at 0
  // there (see PlaybackTimeline).
  useEffect(() => {
    const player = playerRef.current

    if (!player) {
      return
    }

    const isRestart = appliedSrcRef.current === src

    let cancelled = false
    let restartTimer: ReturnType<typeof setTimeout> | null = null

    const clearRestartWatch = () => {
      if (restartTimer !== null) {
        clearTimeout(restartTimer)

        restartTimer = null
      }
    }

    const resolve = () => {
      const cached = resolvedRef.current

      if (cached && cached.src === src) {
        return cached.promise
      }

      const promise = resolveSource(src)

      resolvedRef.current = { promise, src }

      return promise
    }

    void resolve().then((resolved) => {
      if (cancelled || player.isDisposed()) {
        logger.warn('source resolved after dispose or cancel, skipping', src)

        return
      }

      if (reportedSrcRef.current !== src) {
        reportedSrcRef.current = src

        onSourceResolvedRef.current?.(resolved)
      }

      // The override is the length of this session's own timeline, not the
      // file's, so video.js still reaches the end of the stream exactly when
      // the file ends.
      durationOverrideRef.current =
        resolved.duration === null
          ? null
          : Math.max(0, resolved.duration - startSeconds)

      const wasPlaying = isRestart && !player.paused()
      const source = sourceForStart(resolved, startSeconds)

      logger.info('src ->', source, 'startSeconds', startSeconds)

      appliedSrcRef.current = src

      player.src(source)

      if (wasPlaying) {
        player.one('loadedmetadata', () => {
          void player.play()
        })
      }

      if (!isRestart) {
        return
      }

      // A restart spins up a whole new conversion, so it can fail in ways a
      // native seek can't. Leave the viewer with something actionable instead
      // of a black frame — clicking the trackbar again retries.
      const stopRestartWatch = () => {
        clearRestartWatch()

        if (player.isDisposed()) {
          return
        }

        player.off('error', onFailed)
        player.off('playing', onPlaying)
      }

      function onPlaying() {
        stopRestartWatch()
      }

      function onFailed() {
        stopRestartWatch()

        if (player.isDisposed()) {
          return
        }

        player.pause()

        toast.error(seekRestartFailedMessage)
      }

      restartTimer = setTimeout(() => {
        logger.error('restart at', startSeconds, 'never started playing')

        onFailed()
      }, restartTimeoutMs)

      player.one('playing', onPlaying)
      player.one('error', onFailed)
    })

    return () => {
      cancelled = true

      clearRestartWatch()
    }
  }, [src, startSeconds])

  useEffect(() => {
    const player = playerRef.current

    if (!player || poster === undefined) {
      return
    }

    if (poster === initialPosterRef.current) {
      return
    }

    player.poster(poster)
  }, [poster])

  // Sync remote text tracks (subtitles) with the current `subtitles` prop.
  // Skipped for unsupported formats (.ass) — those are surfaced in the UI as
  // disabled menu items but we never actually load them into the player.
  useEffect(() => {
    const player = playerRef.current

    if (!player || player.isDisposed()) {
      return
    }

    const tracks = subtitles ?? []
    const supportedTracks = tracks.filter((track) => track.isSupported)
    const addedElements: unknown[] = []

    for (const track of supportedTracks) {
      const trackElement = player.addRemoteTextTrack(
        {
          src: `/api/subtitles/${track.id}`,
          srclang: track.language,
          label: track.displayLanguage,
          kind: 'subtitles',
          default: false
        },
        false
      )

      addedElements.push(trackElement)
    }

    return () => {
      if (player.isDisposed()) {
        return
      }

      for (const element of addedElements) {
        player.removeRemoteTextTrack(
          element as Parameters<Player['removeRemoteTextTrack']>[0]
        )
      }
    }
  }, [subtitles])

  const handleClick = () => {
    if (!playerRef.current) {
      return
    }

    if (playerRef.current.paused()) {
      void playerRef.current.play()
    } else {
      playerRef.current.pause()
    }
  }

  return (
    <div className="relative w-full h-full">
      <div
        className="absolute inset-0 [&_video]:object-contain"
        ref={videoRef}
      />
      <button
        aria-label="Toggle playback"
        className="absolute inset-0 z-10 cursor-pointer appearance-none border-0 bg-transparent p-0 outline-none"
        onClick={handleClick}
        onKeyDown={handleVideoPlayerKeyDown}
        type="button"
      />
    </div>
  )
}
