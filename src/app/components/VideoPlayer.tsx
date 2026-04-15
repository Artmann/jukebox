import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

interface VideoPlayerProps {
  src: string
  poster?: string
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

export function VideoPlayer({ src, poster, onReady }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)

  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement('video-js')

      videoElement.classList.add('vjs-big-play-centered')

      // Enable AirPlay on Safari/iOS.
      videoElement.setAttribute('x-webkit-airplay', 'allow')
      videoElement.setAttribute('airplay', 'allow')
      videoElement.setAttribute('playsinline', '')

      videoRef.current.appendChild(videoElement)

      const source = pickSource(src)

      playerRef.current = videojs(
        videoElement,
        {
          controls: false,
          autoplay: true,
          fill: true,
          sources: [source],
          poster,
          html5: {
            vhs: {
              overrideNative: false
            }
          }
        },
        () => {
          const player = playerRef.current

          if (player) {
            onReady?.(player)
          }
        }
      )
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  }, [src, poster, onReady])

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
    <div
      ref={videoRef}
      className="w-full h-full cursor-pointer [&_video]:object-contain"
      onClick={handleClick}
    />
  )
}
