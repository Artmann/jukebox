import { useEffect, useRef, type KeyboardEvent } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

import type { SubtitleTrack } from '../lib/media'

interface VideoPlayerProps {
  src: string
  poster?: string
  subtitles?: ReadonlyArray<SubtitleTrack>
  onReady?: (player: Player) => void
}

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

function pickSource(src: string): { src: string; type: string } {
  // For Safari/iOS with an MKV source, rewrite to HLS transcode.
  const isMkv = /\.mkv(\?|$)/i.test(src)

  if (isMkv && (isSafari() || isIos())) {
    // /api/stream/:id or /api/stream/episode/:id -> /api/transcode/<key>/index.m3u8
    const match = src.match(/\/api\/stream\/(?:episode\/)?(\d+)/)

    if (match) {
      const isEpisode = src.includes('/episode/')
      const id = match[1]
      const fileId = isEpisode ? `episode-${id}` : `movie-${id}`

      return {
        src: `/api/transcode/${fileId}/index.m3u8`,
        type: 'application/vnd.apple.mpegurl'
      }
    }
  }

  return { src, type: 'video/mp4' }
}

function handleVideoPlayerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  // The button's native activation already toggles playback — just keep
  // the page-level space hotkey from toggling it a second time.
  event.stopPropagation()
}

export function VideoPlayer({
  src,
  poster,
  subtitles,
  onReady
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
  const onReadyRef = useRef(onReady)
  const initialSrcRef = useRef(src)
  const initialPosterRef = useRef(poster)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

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

    const player = videojs(
      videoElement,
      {
        controls: false,
        autoplay: true,
        fill: true,
        sources: [pickSource(initialSrcRef.current)],
        poster: initialPosterRef.current,
        html5: {
          vhs: {
            overrideNative: false
          }
        }
      },
      () => {
        // StrictMode can dispose this instance before the ready callback
        // fires. Don't hand a disposed player to the parent.
        if (player.isDisposed()) return
        onReadyRef.current?.(player)
      }
    )

    playerRef.current = player

    return () => {
      player.dispose()
      playerRef.current = null
    }
  }, [])

  // Swap the source in-place on prop change.
  useEffect(() => {
    const player = playerRef.current

    if (!player) {
      return
    }

    if (src === initialSrcRef.current) {
      return
    }

    player.src(pickSource(src))
  }, [src])

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
