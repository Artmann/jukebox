import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

interface VideoPlayerProps {
  src: string
  poster?: string
  onReady?: (player: Player) => void
}

export function VideoPlayer({ src, poster, onReady }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)

  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement('video-js')
      videoElement.classList.add('vjs-big-play-centered')
      videoRef.current.appendChild(videoElement)

      playerRef.current = videojs(
        videoElement,
        {
          controls: true,
          autoplay: true,
          fluid: true,
          aspectRatio: '16:9',
          sources: [{ src, type: 'video/mp4' }],
          poster
        },
        () => {
          onReady?.(playerRef.current!)
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

  return <div ref={videoRef} className="w-full" />
}
