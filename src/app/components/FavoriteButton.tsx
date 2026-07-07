import { HeartIcon } from 'lucide-react'
import { type MouseEvent, type ReactElement } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  useIsFavorite,
  useToggleFavorite,
  type FavoriteTarget
} from '../hooks/useFavorites'

interface FavoriteButtonProps {
  className?: string
  target: FavoriteTarget
}

export function FavoriteButton({
  className,
  target
}: FavoriteButtonProps): ReactElement {
  const isFavorite = useIsFavorite(target)
  const toggle = useToggleFavorite()

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    toggle.mutate(
      { target, favorite: !isFavorite },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to update favorite'
          )
        }
      }
    )
  }

  const filled = !!isFavorite

  return (
    <button
      aria-label={filled ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={filled}
      className={cn(
        'flex size-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100 focus:opacity-100',
        filled && 'opacity-100',
        className
      )}
      onClick={handleClick}
      type="button"
    >
      <HeartIcon
        className={cn(
          'size-4 transition-colors',
          filled ? 'fill-red-500 stroke-red-500' : 'stroke-white'
        )}
      />
    </button>
  )
}
