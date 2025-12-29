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
  const bufferedWidth = Math.min(Math.max(buffered, 0), 1) * 100 + '%'
  const progressWidth = Math.min(Math.max(progress, 0), 1) * 100 + '%'

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || !onSeek) return
    const rect = trackRef.current.getBoundingClientRect()
    const position = (e.clientX - rect.left) / rect.width
    onSeek(Math.min(Math.max(position, 0), 1))
  }

  return (
    <div
      ref={trackRef}
      className="relative w-full cursor-pointer"
      onClick={handleClick}
    >
      <div className="w-full h-1 rounded overflow-hidden bg-gray-700/80">
        <div
          className="bg-gray-200/60 absolute inset-y-0 left-0 z-10"
          style={{ width: bufferedWidth }}
        />
        <div
          className="bg-red-700/80 absolute inset-y-0 left-0 z-20"
          style={{ width: progressWidth }}
        />

        <div
          className="bg-red-700 rounded-full size-3 absolute top-1/2 -translate-y-1/2 z-30"
          style={{ left: progressWidth }}
        />
      </div>
    </div>
  )
}
