import { ChevronDown, PlayIcon, X } from 'lucide-react'
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

  const showMoreItem = items.find((item) => item.id === showMoreItemId) || null

  return (
    <>
      {showMoreItem && (
        <div
          className="fixed inset-0 bg-black/70 z-40 p-3"
          onClick={() => setShowMoreItemId(null)}
        >
          <div
            className="rounded-md shadow-md bg-slate-900 text-white overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/90 hover:bg-black/80 cursor-pointer"
              onClick={() => setShowMoreItemId(null)}
            >
              <X className="size-5" />
            </button>

            <div className="relative aspect-video overflow-hidden">
              <img
                src={buildBackdropUrl(showMoreItem.backdropPath) || undefined}
                className="w-full h-full object-cover"
              />

              {showMoreItem.trailerUrl && (
                <iframe
                  src={getYouTubeEmbedUrl(showMoreItem.trailerUrl) || undefined}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              )}

              <div className="absolute inset-0 pointer-events-none bg-linear-to-t from-black/80 via-transparent to-transparent" />

              <div className="absolute bottom-0 left-0 right-0 p-6 z-10 flex flex-col gap-3">
                <div className="font-medium text-2xl">{showMoreItem.title}</div>

                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    className="bg-white text-black hover:bg-white/90"
                  >
                    <Link
                      to={`/watch/${showMoreItem.id}`}
                      className="flex items-center gap-2"
                    >
                      <PlayIcon className="size-4" />
                      Play
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-6 bg-zinc-800">
              <div className="text-gray-300 text-sm mb-2">
                <div>{showMoreItem.year}</div>
              </div>

              <div className="">{showMoreItem.overview}</div>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 p-3 md:p-6">
        {items.map((item) => (
          <GridItem
            key={item.id}
            item={item}
            onShowMoreInformation={() => setShowMoreItemId(item.id)}
          />
        ))}
      </div>
    </>
  )
})

function GridItem({
  item,
  onShowMoreInformation
}: {
  item: Movie
  onShowMoreInformation: () => void
}): ReactElement {
  const [isBeingHovered, setIsBeingHovered] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        setIsBeingHovered(true)
      }}
      onMouseLeave={() => {
        setIsBeingHovered(false)
      }}
    >
      <Link
        aria-label={item.title}
        role="link"
        tabIndex={0}
        to={`/watch/${item.id}`}
      >
        <div className="w-full overflow-hidden rounded-sm">
          <PosterImage
            path={item.posterPath}
            alt={item.title}
            title={item.title}
            className="cursor-pointer w-full"
          />
        </div>
      </Link>

      <div
        className={`
          absolute top-1/2 left-1/2
          -translate-x-1/2 -translate-y-1/2
          z-20
          bg-background
          shadow-md rounded-sm
          transition-all duration-200 ease-in-out
        `}
        style={{
          opacity: isBeingHovered ? 1 : 0,
          pointerEvents: isBeingHovered ? 'auto' : 'none',
          width: isBeingHovered ? '110%' : '0%'
        }}
      >
        <Link
          aria-label={item.title}
          role="link"
          tabIndex={0}
          to={`/watch/${item.id}`}
        >
          <PosterImage
            path={item.posterPath}
            alt={item.title}
            title={item.title}
            className="cursor-pointer w-full"
          />
        </Link>
        <div>
          <div className="flex justify-between items-center px-2 py-2">
            <div>
              <Link
                aria-label="Play"
                className="block rounded-full p-2 bg-black hover:bg-gray-900 text-white"
                role="link"
                to={`/watch/${item.id}`}
              >
                <PlayIcon className="size-3" />
              </Link>
            </div>
            <div>
              <button
                className="block rounded-full border-2 border-border p-2 cursor-pointer"
                onClick={onShowMoreInformation}
              >
                <ChevronDown className="size-3" />
              </button>
            </div>
          </div>
          {/* <div>Runtime</div> */}
          <div className="text-sm px-3 py-2">{item.title}</div>
          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

type BackdropSize = 'w300' | 'w780' | 'w1280' | 'original'

function buildBackdropUrl(
  backdropPath: string | null,
  size: BackdropSize = 'w1280'
): string | null {
  if (!backdropPath) return null
  return `${TMDB_IMAGE_BASE_URL}/${size}${backdropPath}`
}

function getYouTubeEmbedUrl(url: string | null): string | null {
  if (!url) {
    return null
  }

  const match = url.match(/[?&]v=([^&]+)/)

  if (!match || !match[1]) {
    return null
  }

  return `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=0&controls=0&modestbranding=1`
}
