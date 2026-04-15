import { useMemo, type ReactElement } from 'react'

import { useFavorites } from '../hooks/useFavorites'
import type { MediaItem } from '../lib/media'
import { MediaRow } from './MediaRow'

export function FavoritesRow(): ReactElement | null {
  const { data: favorites } = useFavorites()

  const items = useMemo<MediaItem[]>(() => {
    if (!favorites) return []

    return favorites.map((favorite) =>
      favorite.type === 'movie'
        ? { type: 'movie' as const, item: favorite.movie }
        : { type: 'show' as const, item: favorite.show }
    )
  }, [favorites])

  if (items.length === 0) {
    return null
  }

  return (
    <MediaRow
      items={items}
      title="Favorites"
    />
  )
}
