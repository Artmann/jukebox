import { Info, PlayIcon } from 'lucide-react'
import { memo, type ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { Movie } from '../hooks/useMovies'
import { useTitleLinks } from '../hooks/useTitleLinks'
import { FavoriteButton } from './FavoriteButton'
import { PosterImage } from './PosterImage'

export const LibraryGrid = memo(function LibraryGrid({
  items
}: {
  items: Movie[]
}): ReactElement {
  const linkFor = useTitleLinks()

  return (
    <ul
      className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 md:gap-2 p-3 md:p-6"
      role="list"
    >
      {items.map((item) => (
        <GridItem
          item={item}
          key={item.id}
          link={linkFor({ item, type: 'movie' })}
        />
      ))}
    </ul>
  )
})

function GridItem({ item, link }: { item: Movie; link: string }): ReactElement {
  return (
    <li className="group relative">
      <Link
        aria-label={item.title}
        to={link}
      >
        <div className="w-full overflow-hidden rounded-sm transition-transform duration-300 ease-out hover-hover:group-hover:scale-105">
          <PosterImage
            url={item.posterUrl}
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

      <FavoriteButton
        className="absolute right-2 top-2"
        target={{ kind: 'movie', movieId: item.id }}
      />

      <div className="mt-1 flex items-center gap-1">
        <Link
          to={link}
          className="flex-1 min-w-0"
        >
          <p className="text-sm text-muted-foreground truncate">{item.title}</p>

          {item.year && (
            <p className="text-xs text-muted-foreground/70">{item.year}</p>
          )}
        </Link>

        <Link
          aria-label={`More information about ${item.title}`}
          className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          to={`/movies/${item.id}`}
        >
          <Info className="size-4" />
        </Link>
      </div>
    </li>
  )
}
