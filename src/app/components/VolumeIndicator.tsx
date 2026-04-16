import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react'
import type { ReactElement } from 'react'

interface VolumeIndicatorProps {
  muted: boolean
  visible: boolean
  volume: number
}

export function VolumeIndicator({
  muted,
  visible,
  volume
}: VolumeIndicatorProps): ReactElement {
  const getVolumeIcon = () => {
    if (muted || volume === 0) {
      return <VolumeX className="size-6 text-white" />
    }

    if (volume < 0.33) {
      return <Volume className="size-6 text-white" />
    }

    if (volume < 0.66) {
      return <Volume1 className="size-6 text-white" />
    }

    return <Volume2 className="size-6 text-white" />
  }

  const fillWidth = muted ? 0 : volume * 100

  return (
    <div
      aria-hidden="true"
      className={`absolute top-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="bg-black/70 rounded-full px-4 py-2 flex items-center gap-3 text-white">
        {getVolumeIcon()}

        <div className="relative w-32 h-1.5 bg-white/25 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 bottom-0 bg-white rounded-full transition-[width] duration-150"
            style={{ width: `${fillWidth}%` }}
          />
        </div>
      </div>
    </div>
  )
}
