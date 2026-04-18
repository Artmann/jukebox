import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { Movie } from '../hooks/useMovies'
import { PosterImage } from './PosterImage'

interface MovieRowProps {
  movies: Movie[]
  title: string
}

export function MovieRow({
  movies,
  title
}: MovieRowProps): ReactElement | null {
  if (movies.length === 0) {
    return null
  }

  return (
    <section className="px-6 py-4">
      <h2 className="text-lg font-semibold text-foreground mb-3">{title}</h2>

      <div className="flex gap-2 overflow-x-auto scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {movies.map((movie) => (
          <Link
            className="flex-shrink-0 w-32 md:w-40 group"
            key={movie.id}
            to={`/watch/${movie.id}`}
          >
            <div className="w-full overflow-hidden rounded-sm">
              <PosterImage
                alt={movie.title}
                className="w-full transition-transform duration-200 group-hover:scale-105"
                url={movie.posterUrl}
                title={movie.title}
              />
            </div>

            <p className="text-xs text-muted-foreground truncate mt-1.5 px-0.5">
              {movie.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
