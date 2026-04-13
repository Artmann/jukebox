import type { MouseEvent, ReactElement } from 'react'
import { useRef } from 'react'

interface VideoTrackBarProps {
  buffered: number
  progress: number
  onSeek?: (position: number) => void
}

export function VideoTrackBar({
  buffered,
  progress,
  onSeek
}: VideoTrackBarProps): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const bufferedPercent = Math.min(Math.max(buffered, 0), 1) * 100 + '%'
  const progressPercent = Math.min(Math.max(progress, 0), 1) * 100 + '%'

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || !onSeek) return
    const rect = trackRef.current.getBoundingClientRect()
    const position = (e.clientX - rect.left) / rect.width
    onSeek(Math.min(Math.max(position, 0), 1))
  }

  return (
    <div
      ref={trackRef}
      className="relative w-full h-4 cursor-pointer flex items-center"
      onClick={handleClick}
    >
      <div className="w-full h-1 rounded-full bg-white/20 relative overflow-hidden">
        <div
          className="h-full bg-white/30 absolute left-0 top-0 z-0"
          style={{ width: bufferedPercent }}
        />

        <div
          className="h-full bg-red-600 absolute left-0 top-0 z-10"
          style={{ width: progressPercent }}
        />
      </div>

      <div
        className="bg-red-600 rounded-full size-3 absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
        style={{ left: progressPercent }}
      />
    </div>
  )
}
