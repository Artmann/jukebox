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

    videoRef.current.appendChild(videoElement)

    const player = videojs(
      videoElement,
      {
        controls: false,
        autoplay: true,
        fill: true,
        sources: [{ src: initialSrcRef.current, type: 'video/mp4' }],
        poster: initialPosterRef.current
      },
      () => {
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

    player.src({ src, type: 'video/mp4' })
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
