import { Film } from 'lucide-react'
import { useMemo } from 'react'

import { MediaRow } from '../components/MediaRow'
import { PageHeader } from '../components/PageHeader'
import { SkeletonRow } from '../components/SkeletonRow'
import { useMovies } from '../hooks/useMovies'
import { buildGenreRows } from '../lib/genres'
import type { MediaItem } from '../lib/media'

export function MoviesPage() {
  const { data: movies, isLoading } = useMovies()

  const movieItems: MediaItem[] = useMemo(() => {
    if (!movies) {
      return []
    }

    return movies.map((item) => ({ type: 'movie' as const, item }))
  }, [movies])

  const genreRows = useMemo(() => {
    if (movieItems.length === 0) {
      return []
    }

    return buildGenreRows(movieItems)
  }, [movieItems])

  if (isLoading) {
    return (
      <>
        <PageHeader />
        <div className="pt-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </>
    )
  }

  if (movieItems.length === 0) {
    return (
      <>
        <PageHeader />

        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
          <Film className="size-16 text-muted-foreground" />

          <h2 className="text-xl font-semibold text-foreground">
            No movies in your library
          </h2>

          <p className="text-sm text-muted-foreground max-w-md">
            Run{' '}
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
              bun run scan /path/to/movies
            </code>{' '}
            to add your collection.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader />

      <div className="pt-2 pb-8">
        {genreRows.map(({ genre, items }) => (
          <MediaRow
            key={genre}
            items={items}
            title={genre}
          />
        ))}
      </div>
    </>
  )
}
