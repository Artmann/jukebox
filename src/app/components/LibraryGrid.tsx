import { Info, PlayIcon, X } from 'lucide-react'
import { memo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { Movie } from '../hooks/useMovies'
import { Button } from '@/components/ui/button'
import { PosterImage } from './PosterImage'

export const LibraryGrid = memo(function LibraryGrid({
  items
}: {
  items: Movie[]
}): ReactElement {
  const [showMoreItemId, setShowMoreItemId] = useState<number | null>(null)

  const showMoreItem = items.find((item) => item.id === showMoreItemId) ?? null

  return (
    <>
      {showMoreItem && (
        <DetailModal
          item={showMoreItem}
          onClose={() => setShowMoreItemId(null)}
        />
      )}

      <ul
        className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 md:gap-2 p-3 md:p-6"
        role="list"
      >
        {items.map((item) => (
          <GridItem
            key={item.id}
            item={item}
            onShowMoreInformation={() => setShowMoreItemId(item.id)}
          />
        ))}
      </ul>
    </>
  )
})

function DetailModal({
  item,
  onClose
}: {
  item: Movie
  onClose: () => void
}): ReactElement {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-40 p-3"
      onClick={onClose}
    >
      <div
        className="rounded-md shadow-md bg-card text-foreground overflow-hidden relative"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/90 hover:bg-black/80 cursor-pointer"
          onClick={onClose}
        >
          <X className="size-5 text-white" />
        </button>

        <div className="relative aspect-video overflow-hidden">
          {item.trailerUrl ? (
            <iframe
              src={getYouTubeEmbedUrl(item.trailerUrl) ?? undefined}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : (
            <img
              src={buildBackdropUrl(item.backdropPath) ?? undefined}
              className="w-full h-full object-cover"
            />
          )}

          <div className="absolute inset-0 pointer-events-none bg-linear-to-t from-black/80 via-transparent to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-6 z-10 flex flex-col gap-3">
            <div className="font-medium text-2xl text-white">{item.title}</div>

            <div className="flex items-center gap-2">
              <Button
                asChild
                className="bg-white text-black hover:bg-white/90"
              >
                <Link
                  to={`/watch/${item.id}`}
                  className="flex items-center gap-2"
                >
                  <PlayIcon className="size-4" />
                  Play
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-muted">
          <div className="text-muted-foreground text-sm mb-2">
            <div>{item.year}</div>
          </div>

          <div>{item.overview}</div>
        </div>
      </div>
    </div>
  )
}

function GridItem({
  item,
  onShowMoreInformation
}: {
  item: Movie
  onShowMoreInformation: () => void
}): ReactElement {
  return (
    <li className="group relative">
      <Link
        aria-label={item.title}
        to={`/watch/${item.id}`}
      >
        <div className="w-full overflow-hidden rounded-sm transition-transform duration-300 ease-out hover-hover:group-hover:scale-105">
          <PosterImage
            path={item.posterPath}
            alt={item.title}
            title={item.title}
            className="cursor-pointer w-full"
          />

          <div className="absolute inset-0 rounded-sm bg-linear-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 hover-hover:group-hover:opacity-100" />

          <div className="absolute bottom-8 left-0 right-0 px-2 flex items-center gap-1 opacity-0 transition-opacity duration-300 hover-hover:group-hover:opacity-100">
            <PlayIcon className="size-3 text-white shrink-0" />
            <span className="text-white text-xs font-medium truncate">
              {item.title}
            </span>
          </div>
        </div>
      </Link>

      <div className="mt-1 flex items-center gap-1">
        <Link
          to={`/watch/${item.id}`}
          className="flex-1 min-w-0"
        >
          <p className="text-sm text-muted-foreground truncate">{item.title}</p>

          {item.year && (
            <p className="text-xs text-muted-foreground/70">{item.year}</p>
          )}
        </Link>

        <button
          aria-label={`More information about ${item.title}`}
          className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          onClick={onShowMoreInformation}
        >
          <Info className="size-4" />
        </button>
      </div>
    </li>
  )
}

const tmdbImageBaseUrl = 'https://image.tmdb.org/t/p'

type BackdropSize = 'w300' | 'w780' | 'w1280' | 'original'

function buildBackdropUrl(
  backdropPath: string | null,
  size: BackdropSize = 'w1280'
): string | null {
  if (!backdropPath) return null

  return `${tmdbImageBaseUrl}/${size}${backdropPath}`
}

function getYouTubeEmbedUrl(url: string | null): string | null {
  if (!url) {
    return null
  }

  const match = url.match(/[?&]v=([^&]+)/)

  if (!match?.[1]) {
    return null
  }

  return `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=0&controls=0&modestbranding=1`
}
