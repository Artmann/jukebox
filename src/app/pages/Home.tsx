import { Film } from 'lucide-react'
import { useMemo } from 'react'

import { ContinueWatchingRow } from '../components/ContinueWatchingRow'
import { MediaRow } from '../components/MediaRow'
import { PageHeader } from '../components/PageHeader'
import { SkeletonRow } from '../components/SkeletonRow'
import { useContinueWatching } from '../hooks/useContinueWatching'
import { useMovies } from '../hooks/useMovies'
import { useShows } from '../hooks/useShows'
import { buildGenreRows } from '../lib/genres'
import { mergeMedia, type MediaItem } from '../lib/media'

const maxGenreRows = 6
const recentlyAddedLimit = 20

export function HomePage() {
  const { data: movies, isLoading: isLoadingMovies } = useMovies()
  const { data: shows, isLoading: isLoadingShows } = useShows()
  const { data: continueWatchingItems, isLoading: isLoadingContinueWatching } =
    useContinueWatching()

  const isLoading = isLoadingMovies || isLoadingShows || isLoadingContinueWatching

  const allMedia = useMemo(
    () => mergeMedia(movies ?? [], shows ?? []),
    [movies, shows]
  )

  const genreRows = useMemo(() => {
    if (allMedia.length === 0) {
      return []
    }

    return buildGenreRows(allMedia, maxGenreRows)
  }, [allMedia])

  const recentlyAdded: MediaItem[] = useMemo(() => {
    if (allMedia.length === 0) {
      return []
    }

    return [...allMedia]
      .sort(
        (a, b) =>
          new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime()
      )
      .slice(0, recentlyAddedLimit)
  }, [allMedia])

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

  if (allMedia.length === 0) {
    return (
      <>
        <PageHeader />

        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
          <Film className="size-16 text-muted-foreground" />

          <h2 className="text-xl font-semibold text-foreground">
            No media in your library
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

        {genreRows.map(({ genre, items }) => (
          <MediaRow key={genre} items={items} title={genre} />
        ))}

        <MediaRow items={recentlyAdded} title="Recently Added" />
      </div>
    </>
  )
}
