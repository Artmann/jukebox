import type { MediaItem } from './media'

export interface GenreRow {
  genre: string
  items: MediaItem[]
}

export function buildGenreRows(
  items: MediaItem[],
  limit?: number,
  minimumItems = 2
): GenreRow[] {
  const genreMap = new Map<string, MediaItem[]>()

  for (const mediaItem of items) {
    const genres = parseGenresFromMedia(mediaItem)

    for (const genre of genres) {
      const existing = genreMap.get(genre) ?? []
      existing.push(mediaItem)
      genreMap.set(genre, existing)
    }
  }

  const rows = Array.from(genreMap.entries())
    .filter(([, genreItems]) => genreItems.length >= minimumItems)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([genre, genreItems]) => ({ genre, items: genreItems }))

  if (limit) {
    return rows.slice(0, limit)
  }

  return rows
}

export function parseGenresFromMedia(mediaItem: MediaItem): string[] {
  const genresString = mediaItem.item.genres

  return parseGenres(genresString)
}

export function parseGenres(genres: string | null): string[] {
  if (!genres) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(genres)

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }

    return []
  } catch {
    return []
  }
}
