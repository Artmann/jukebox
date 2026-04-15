import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { UpNextItem } from '../hooks/useUpNext'
import { PosterImage } from './PosterImage'

interface UpNextRowProps {
  items: UpNextItem[]
}

export function UpNextRow({ items }: UpNextRowProps): ReactElement | null {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="px-6 py-4">
      <h2 className="text-lg font-semibold text-foreground mb-3">Up Next</h2>

      <div className="flex gap-2 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.map((item) => {
          const subtitle = `Next: S${item.episode.seasonNumber} E${item.episode.episodeNumber} — ${item.episode.title}`

          return (
            <Link
              className="flex-shrink-0 w-32 md:w-40 group"
              key={`up-next-${item.show.id}-${item.episode.id}`}
              to={`/watch/episode/${item.episode.id}`}
            >
              <div className="relative w-full overflow-hidden rounded-sm">
                <PosterImage
                  alt={item.show.title}
                  className="w-full transition-transform duration-200 group-hover:scale-105"
                  path={item.show.posterPath}
                  size="w342"
                  title={item.show.title}
                />
              </div>

              <p className="text-xs text-muted-foreground truncate mt-1.5 px-0.5">
                {item.show.title}
              </p>
              <p className="text-xs text-muted-foreground/70 truncate px-0.5">
                {subtitle}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
