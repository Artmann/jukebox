import type { PointerEvent, ReactElement } from 'react'
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
  const isDraggingRef = useRef(false)

  const bufferedPercent = Math.min(Math.max(buffered, 0), 1) * 100 + '%'
  const progressPercent = Math.min(Math.max(progress, 0), 1) * 100 + '%'

  const seekFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current || !onSeek) return

    const rect = trackRef.current.getBoundingClientRect()
    const position = (event.clientX - rect.left) / rect.width

    onSeek(Math.min(Math.max(position, 0), 1))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return

    trackRef.current.setPointerCapture(event.pointerId)
    isDraggingRef.current = true
    seekFromEvent(event)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    seekFromEvent(event)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return

    if (trackRef.current.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId)
    }

    isDraggingRef.current = false
  }

  return (
    <div
      ref={trackRef}
      className="relative w-full h-4 cursor-pointer flex items-center touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
