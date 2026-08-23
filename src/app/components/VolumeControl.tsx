import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react'
import { type ChangeEvent, type ReactElement } from 'react'
import type Player from 'video.js/dist/types/player'

import { usePlayerVolume } from '../hooks/usePlayerVolume'

interface VolumeControlProps {
  player: Player | null
}

export function VolumeControl({ player }: VolumeControlProps): ReactElement {
  const { muted, setVolume, toggleMute, volume } = usePlayerVolume(player)

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(event.target.value) / 100)
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
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="p-2 flex justify-center items-center cursor-pointer"
        onClick={toggleMute}
        type="button"
      >
        {getVolumeIcon()}
      </button>

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 hidden group-hover:block group-focus-within:block z-50 pb-2">
        <div className="bg-black/90 rounded-lg p-3 shadow-lg border border-white/20">
          {/* A native vertical range input so keyboard, focus, and screen
              reader semantics come for free. The gradient paints the fill
              below the thumb, matching the old custom slider. */}
          <input
            aria-label="Volume"
            className="block h-24 w-2 cursor-pointer appearance-none rounded [writing-mode:vertical-lr] [direction:rtl] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
            max={100}
            min={0}
            onChange={handleVolumeChange}
            step={5}
            style={{
              background: `linear-gradient(to top, white ${fillHeight}%, rgba(255, 255, 255, 0.2) ${fillHeight}%)`
            }}
            type="range"
            value={Math.round(fillHeight)}
          />
        </div>
      </div>
    </div>
  )
}
