import { useMovies } from '../hooks/useMovies'
import { LibraryGrid } from '../components/LibraryGrid'
import { PageHeader } from '../components/PageHeader'

export function MoviesPage() {
  const { data: movies } = useMovies()

  return (
    <>
      <PageHeader />
      <LibraryGrid items={movies || []} />
    </>
  )
}
