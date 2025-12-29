import { Maximize, PlayIcon, RotateCcw, RotateCw } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

interface VideoControlsProps {
  title: string
}

export function VideoControls({ title }: VideoControlsProps) {
  return (
    <div className="px-6">
      <div className="flex justify-between items-center py-4">
        <div className="flex gap-2">
          <IconButton>
            <PlayIcon className="size-7 hover:scale-125 text-white" />
          </IconButton>

          <IconButton>
            <RotateCcw className="size-7 hover:scale-125 text-white" />
          </IconButton>

          <IconButton>
            <RotateCw className="size-7 hover:scale-125 text-white" />
          </IconButton>
        </div>

        <div className="text-white text-lg">{title}</div>

        <div>
          <IconButton>
            <Maximize className="size-7 hover:scale-125 text-white" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

function IconButton({ children }: { children: ReactNode }): ReactElement {
  return (
    <button className="p-2 flex justify-center items-center">{children}</button>
  )
}
