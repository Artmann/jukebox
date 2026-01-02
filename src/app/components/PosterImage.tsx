import { Film } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

type PosterSize =
  | 'w92'
  | 'w154'
  | 'w185'
  | 'w342'
  | 'w500'
  | 'w780'
  | 'original'

interface PosterImageProps {
  path: string | null
  alt: string
  title: string
  size?: PosterSize
  className?: string
}

export function PosterImage({
  path,
  alt,
  title,
  size = 'w500',
  className
}: PosterImageProps): ReactElement {
  if (!path) {
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
      src={`${TMDB_IMAGE_BASE_URL}/${size}${path}`}
    />
  )
}
