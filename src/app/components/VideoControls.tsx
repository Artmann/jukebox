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
  const [progress, setProgress] = useState(0)
  const [buffered, setBuffered] = useState(0)

  useEffect(() => {
    if (!player) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    const onTimeUpdate = () => {
      const currentTime = player.currentTime() ?? 0
      const duration = player.duration() ?? 0
      if (duration > 0) {
        setProgress(currentTime / duration)
      }
    }

    const onProgress = () => {
      const bufferedRanges = player.buffered()
      const duration = player.duration() ?? 0
      if (bufferedRanges && bufferedRanges.length > 0 && duration > 0) {
        // Get the end of the last buffered range
        const bufferedEnd = bufferedRanges.end(bufferedRanges.length - 1)
        setBuffered(bufferedEnd / duration)
      }
    }

    player.on('play', onPlay)
    player.on('pause', onPause)
    player.on('timeupdate', onTimeUpdate)
    player.on('progress', onProgress)

    // Set initial state
    setIsPlaying(!player.paused())

    return () => {
      player.off('play', onPlay)
      player.off('pause', onPause)
      player.off('timeupdate', onTimeUpdate)
      player.off('progress', onProgress)
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

  const handleSeek = (position: number) => {
    if (!player) return
    const duration = player.duration() ?? 0
    player.currentTime(position * duration)
  }

  return (
    <div className="px-6">
      <div>
        <VideoTrackBar
          buffered={buffered}
          progress={progress}
          onSeek={handleSeek}
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
