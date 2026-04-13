import { Film } from 'lucide-react'
import { useMemo } from 'react'

import { MediaRow } from '../components/MediaRow'
import { PageHeader } from '../components/PageHeader'
import { SkeletonRow } from '../components/SkeletonRow'
import { useShows } from '../hooks/useShows'
import { buildGenreRows } from '../lib/genres'
import type { MediaItem } from '../lib/media'

export function ShowsPage() {
  const { data: shows, isLoading } = useShows()

  const showItems: MediaItem[] = useMemo(() => {
    if (!shows) {
      return []
    }

    return shows.map((item) => ({ type: 'show' as const, item }))
  }, [shows])

  const genreRows = useMemo(() => {
    if (showItems.length === 0) {
      return []
    }

    return buildGenreRows(showItems)
  }, [showItems])

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

  if (showItems.length === 0) {
    return (
      <>
        <PageHeader />

        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
          <Film className="size-16 text-muted-foreground" />

          <h2 className="text-xl font-semibold text-foreground">
            No shows in your library
          </h2>

          <p className="text-sm text-muted-foreground max-w-md">
            Run{' '}
            <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
              bun run scan --shows /path/to/shows
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
          <MediaRow key={genre} items={items} title={genre} />
        ))}
      </div>
    </>
  )
}
