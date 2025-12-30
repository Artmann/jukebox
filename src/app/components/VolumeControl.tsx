import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from 'react'
import type Player from 'video.js/dist/types/player'

interface VolumeControlProps {
  player: Player | null
}

const STORAGE_KEY = 'jukebox-volume'

function getStoredVolume(): { volume: number; muted: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore errors
  }
  return { volume: 1, muted: false }
}

function storeVolume(volume: number, muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }))
  } catch {
    // Ignore errors
  }
}

export function VolumeControl({ player }: VolumeControlProps): ReactElement {
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)

  // Initialize from localStorage and sync with player
  useEffect(() => {
    if (!player) {
      return
    }

    const stored = getStoredVolume()
    setVolume(stored.volume)
    setMuted(stored.muted)
    player.volume(stored.volume)
    player.muted(stored.muted)

    const onVolumeChange = () => {
      const newVolume = player.volume() ?? 1
      const newMuted = player.muted() ?? false
      setVolume(newVolume)
      setMuted(newMuted)
      storeVolume(newVolume, newMuted)
    }

    player.on('volumechange', onVolumeChange)

    return () => {
      player.off('volumechange', onVolumeChange)
    }
  }, [player])

  const toggleMute = () => {
    if (!player) {
      return
    }
    player.muted(!muted)
  }

  const handleSliderClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current || !player) {
      return
    }

    const rect = sliderRef.current.getBoundingClientRect()
    // Invert because bottom = 100%, top = 0%
    const position = 1 - (event.clientY - rect.top) / rect.height
    const newVolume = Math.min(Math.max(position, 0), 1)

    player.volume(newVolume)
    if (newVolume > 0 && muted) {
      player.muted(false)
    }
  }

  const getVolumeIcon = () => {
    if (muted || volume === 0) {
      return <VolumeX className="size-7 text-white" />
    }
    if (volume < 0.33) {
      return <Volume className="size-7 text-white" />
    }
    if (volume < 0.66) {
      return <Volume1 className="size-7 text-white" />
    }
    return <Volume2 className="size-7 text-white" />
  }

  const fillHeight = muted ? 0 : volume * 100

  return (
    <div className="relative group">
      <button
        className="p-2 flex justify-center items-center cursor-pointer"
        onClick={toggleMute}
      >
        {getVolumeIcon()}
      </button>

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 hidden group-hover:block z-50 pb-2">
        <div className="bg-black/90 rounded-lg p-3 shadow-lg border border-gray-700">
          <div
            ref={sliderRef}
            className="relative w-2 h-24 bg-gray-700 rounded cursor-pointer"
            onClick={handleSliderClick}
          >
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded"
              style={{ height: `${fillHeight}%` }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full"
              style={{ bottom: `calc(${fillHeight}% - 6px)` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
