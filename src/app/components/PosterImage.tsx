import { Film } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

interface PosterImageProps {
  url: string | null
  alt: string
  title: string
  className?: string
}

export function PosterImage({
  url,
  alt,
  title,
  className
}: PosterImageProps): ReactElement {
  if (!url) {
    return (
      <div
        className={cn(
          'bg-zinc-800 flex flex-col items-center justify-center aspect-[2/3] p-4 gap-3',
          className
        )}
      >
        <Film className="size-12 text-zinc-600" />
        <span className="text-zinc-400 text-sm text-center line-clamp-3">
          {title}
        </span>
      </div>
    )
  }

  return (
    <img
      alt={alt}
      className={className}
      loading="lazy"
      src={url}
    />
  )
}
