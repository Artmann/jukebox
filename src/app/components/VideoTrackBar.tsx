import type { ReactElement } from 'react'

interface VideoTrackBarProps {
  buffered: number
  progress: number
}

export function VideoTrackBar({
  buffered,
  progress
}: VideoTrackBarProps): ReactElement {
  const bufferedWidth = Math.min(Math.max(buffered, 0), 1) * 100 + '%'
  const progressWidth = Math.min(Math.max(progress, 0), 1) * 100 + '%'

  return (
    <div className="relative w-full">
      <div className="w-full h-1 group hover:scale-y-110 rounded overflow-hidden bg-gray-700/80">
        <div
          className="bg-gray-200/60 absolute bottom-0 top-0 left-0 z-10"
          style={{ width: bufferedWidth }}
        />
        <div
          className="bg-red-700/80 absolute bottom-0 top-0 left-0 z-20"
          style={{ width: progressWidth }}
        />

        <div
          className="bg-red-700 rounded-full size-3 absolute top-1/2 -translate-y-1/2 z-30"
          id="handle"
        />
      </div>
    </div>
  )
}
