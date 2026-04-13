import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { ContinueWatchingItem } from '../hooks/useContinueWatching'
import { PosterImage } from './PosterImage'

interface ContinueWatchingRowProps {
  items: ContinueWatchingItem[]
}

export function ContinueWatchingRow({
  items
}: ContinueWatchingRowProps): ReactElement | null {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="px-6 py-4">
      <h2 className="text-lg font-semibold text-foreground mb-3">
        Continue Watching
      </h2>

      <div className="flex gap-2 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.map((item) => {
          const isMovie = item.type === 'movie'
          const key = isMovie ? `movie-${item.movie.id}` : `episode-${item.episode.id}`
          const link = isMovie ? `/watch/${item.movie.id}` : `/watch/episode/${item.episode.id}`
          const title = isMovie ? item.movie.title : item.show.title
          const subtitle = isMovie ? null : `S${item.episode.seasonNumber} E${item.episode.episodeNumber}`
          const posterPath = isMovie ? item.movie.posterPath : item.show.posterPath
          const progress = item.duration
            ? Math.min((item.currentTime / item.duration) * 100, 100)
            : 0

          return (
            <Link className="flex-shrink-0 w-32 md:w-40 group" key={key} to={link}>
              <div className="relative w-full overflow-hidden rounded-sm">
                <PosterImage
                  alt={title}
                  className="w-full transition-transform duration-200 group-hover:scale-105"
                  path={posterPath}
                  size="w342"
                  title={title}
                />

                <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/50">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground truncate mt-1.5 px-0.5">
                {title}
              </p>

              {subtitle && (
                <p className="text-xs text-muted-foreground/70 truncate px-0.5">
                  {subtitle}
                </p>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
