import { type KeyboardEvent } from 'react'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

import { useSubtitleTracks } from '../hooks/useSubtitleTracks'
import { useVideoJsPlayer } from '../hooks/useVideoJsPlayer'
import type { SubtitleTrack } from '../lib/media'
import type { ResolvedSource } from '../lib/resolve-source'

interface VideoPlayerProps {
  onReady?: (player: Player) => void
  onSourceResolved?: (source: ResolvedSource) => void
  poster?: string
  src: string
  startSeconds?: number
  subtitles?: ReadonlyArray<SubtitleTrack>
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
  onReady,
  onSourceResolved,
  poster,
  src,
  startSeconds = 0,
  subtitles
}: VideoPlayerProps) {
  const { playerRef, videoRef } = useVideoJsPlayer({
    onReady,
    onSourceResolved,
    poster,
    src,
    startSeconds
  })

  useSubtitleTracks(playerRef, subtitles)

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
