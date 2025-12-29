import {
  Maximize,
  PauseIcon,
  PlayIcon,
  RotateCcw,
  RotateCw
} from 'lucide-react'
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type Player from 'video.js/dist/types/player'
import { VideoTrackBar } from './VideoTrackBar'

interface VideoControlsProps {
  title: string
  player: Player | null
}

const SKIP_SECONDS = 10

export function VideoControls({ title, player }: VideoControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!player) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    player.on('play', onPlay)
    player.on('pause', onPause)

    // Set initial state
    setIsPlaying(!player.paused())

    return () => {
      player.off('play', onPlay)
      player.off('pause', onPause)
    }
  }, [player])

  const handlePlayPause = () => {
    if (!player) return
    if (player.paused()) {
      player.play()
    } else {
      player.pause()
    }
  }

  const handleSkipBackward = () => {
    if (!player) return
    const currentTime = player.currentTime() ?? 0
    player.currentTime(Math.max(0, currentTime - SKIP_SECONDS))
  }

  const handleSkipForward = () => {
    if (!player) return
    const currentTime = player.currentTime() ?? 0
    const duration = player.duration() ?? 0
    player.currentTime(Math.min(duration, currentTime + SKIP_SECONDS))
  }

  const handleFullscreen = () => {
    if (!player) return
    if (player.isFullscreen()) {
      player.exitFullscreen()
    } else {
      player.requestFullscreen()
    }
  }

  return (
    <div className="px-6">
      <div>
        <VideoTrackBar
          buffered={0.6}
          progress={0.3}
        />
      </div>
      <div className="flex justify-between items-center py-4">
        <div className="flex gap-2">
          <IconButton onClick={handlePlayPause}>
            {isPlaying ? (
              <PauseIcon className="size-7 hover:scale-125 text-white" />
            ) : (
              <PlayIcon className="size-7 hover:scale-125 text-white" />
            )}
          </IconButton>

          <IconButton onClick={handleSkipBackward}>
            <RotateCcw className="size-7 hover:scale-125 text-white" />
          </IconButton>

          <IconButton onClick={handleSkipForward}>
            <RotateCw className="size-7 hover:scale-125 text-white" />
          </IconButton>
        </div>

        <div className="text-white text-sm truncate">{title}</div>

        <div>
          <IconButton onClick={handleFullscreen}>
            <Maximize className="size-7 hover:scale-125 text-white" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

interface IconButtonProps {
  children: ReactNode
  onClick?: () => void
}

function IconButton({ children, onClick }: IconButtonProps): ReactElement {
  return (
    <button
      className="p-2 flex justify-center items-center cursor-pointer"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
