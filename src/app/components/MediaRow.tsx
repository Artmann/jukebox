import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { MediaItem } from '../lib/media'
import { FavoriteButton } from './FavoriteButton'
import { PosterImage } from './PosterImage'

interface MediaRowProps {
  items: MediaItem[]
  title: string
}

export function MediaRow({ items, title }: MediaRowProps): ReactElement | null {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="px-6 py-4">
      <h2 className="text-lg font-semibold text-foreground mb-3">{title}</h2>

      <div className="flex gap-2 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.map((mediaItem) => {
          const id =
            mediaItem.type === 'movie'
              ? `movie-${mediaItem.item.id}`
              : `show-${mediaItem.item.id}`
          const link =
            mediaItem.type === 'movie'
              ? `/watch/${mediaItem.item.id}`
              : `/shows/${mediaItem.item.id}`

          return (
            <Link
              className="flex-shrink-0 w-32 md:w-40 group"
              key={id}
              to={link}
            >
              <div className="relative w-full overflow-hidden rounded-sm">
                <PosterImage
                  alt={mediaItem.item.title}
                  className="w-full transition-transform duration-200 group-hover:scale-105"
                  path={mediaItem.item.posterPath}
                  size="w342"
                  title={mediaItem.item.title}
                />

                <FavoriteButton
                  className="absolute right-2 top-2"
                  target={
                    mediaItem.type === 'movie'
                      ? { kind: 'movie', movieId: mediaItem.item.id }
                      : { kind: 'show', showId: mediaItem.item.id }
                  }
                />
              </div>

              <p className="text-xs text-muted-foreground truncate mt-1.5 px-0.5">
                {mediaItem.item.title}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
