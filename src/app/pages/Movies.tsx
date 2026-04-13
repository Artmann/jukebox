import { useMovies } from '../hooks/useMovies'
import { LibraryGrid } from '../components/LibraryGrid'
import { PageHeader } from '../components/PageHeader'
import { SkeletonGrid } from '../components/SkeletonGrid'

export function MoviesPage() {
  const { data: movies, isLoading } = useMovies()

  return (
    <>
      <PageHeader />

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <LibraryGrid items={movies ?? []} />
      )}
    </>
  )
}
