import { Film } from 'lucide-react'
import { useMemo } from 'react'

import { ContinueWatchingRow } from '../components/ContinueWatchingRow'
import { MovieRow } from '../components/MovieRow'
import { PageHeader } from '../components/PageHeader'
import { SkeletonRow } from '../components/SkeletonRow'
import { useContinueWatching } from '../hooks/useContinueWatching'
import { useMovies } from '../hooks/useMovies'
import { buildGenreRows } from '../lib/genres'

const maxGenreRows = 6
const recentlyAddedLimit = 20

export function HomePage() {
  const { data: movies, isLoading: isLoadingMovies } = useMovies()
  const { data: continueWatchingItems, isLoading: isLoadingContinueWatching } =
    useContinueWatching()

  const isLoading = isLoadingMovies || isLoadingContinueWatching

  const genreRows = useMemo(() => {
    if (!movies) {
      return []
    }

    return buildGenreRows(movies, maxGenreRows)
  }, [movies])

  const recentlyAdded = useMemo(() => {
    if (!movies) {
      return []
    }

    return [...movies]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, recentlyAddedLimit)
  }, [movies])

  if (isLoading) {
    return (
      <>
        <PageHeader />
        <div className="pt-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </>
    )
  }

  if (!movies || movies.length === 0) {
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
        {continueWatchingItems && continueWatchingItems.length > 0 && (
          <ContinueWatchingRow items={continueWatchingItems} />
        )}

        {genreRows.map(({ genre, movies: genreMovies }) => (
          <MovieRow
            key={genre}
            movies={genreMovies}
            title={genre}
          />
        ))}

        <MovieRow
          movies={recentlyAdded}
          title="Recently Added"
        />
      </div>
    </>
  )
}
