import type { PointerEvent, ReactElement } from 'react'
import { useRef, useState } from 'react'

interface VideoTrackBarProps {
  buffered: number
  progress: number
  // How far playback can jump to right now. For a transcode still in progress
  // that's the transcode head; seeking past it restarts the conversion, which
  // takes a moment, so it's worth showing.
  reachable: number
  onSeek?: (position: number) => void
}

function toPercent(value: number): string {
  return Math.min(Math.max(value, 0), 1) * 100 + '%'
}

export function VideoTrackBar({
  buffered,
  progress,
  reachable,
  onSeek
}: VideoTrackBarProps): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  // While dragging, the bar follows the cursor but playback doesn't move.
  // Seeking on every pointermove would be one restarted transcode per mouse
  // pixel, so the position is committed once, on release.
  const [scrubPosition, setScrubPosition] = useState<number | null>(null)

  const bufferedPercent = toPercent(buffered)
  const progressPercent = toPercent(scrubPosition ?? progress)
  const reachablePercent = toPercent(reachable)

  const positionFromEvent = (
    event: PointerEvent<HTMLDivElement>
  ): number | null => {
    if (!trackRef.current) {
      return null
    }

    const rect = trackRef.current.getBoundingClientRect()

    if (rect.width === 0) {
      return null
    }

    const position = (event.clientX - rect.left) / rect.width

    return Math.min(Math.max(position, 0), 1)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) {
      return
    }

    trackRef.current.setPointerCapture(event.pointerId)

    isDraggingRef.current = true

    setScrubPosition(positionFromEvent(event))
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) {
      return
    }

    setScrubPosition(positionFromEvent(event))
  }

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (trackRef.current?.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId)
    }

    isDraggingRef.current = false
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) {
      return
    }

    const wasDragging = isDraggingRef.current
    const position = positionFromEvent(event)

    releasePointer(event)
    setScrubPosition(null)

    if (wasDragging && position !== null) {
      onSeek?.(position)
    }
  }

  // A cancelled pointer (the browser taking over, a lost touch) is not a seek
  // — drop the preview and leave playback where it is.
  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) {
      return
    }

    releasePointer(event)
    setScrubPosition(null)
  }

  return (
    <div
      ref={trackRef}
      className="relative w-full h-4 cursor-pointer flex items-center touch-none"
      data-testid="video-track-bar"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="w-full h-1 rounded-full bg-white/20 relative overflow-hidden">
        <div
          className="h-full bg-white/20 absolute left-0 top-0 z-0"
          data-testid="video-track-bar-reachable"
          style={{ width: reachablePercent }}
        />

        <div
          className="h-full bg-white/30 absolute left-0 top-0 z-0"
          data-testid="video-track-bar-buffered"
          style={{ width: bufferedPercent }}
        />

        <div
          className="h-full bg-red-600 absolute left-0 top-0 z-10"
          data-testid="video-track-bar-progress"
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
