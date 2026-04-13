import type { Movie } from '../hooks/useMovies'

export interface GenreRow {
  genre: string
  movies: Movie[]
}

export function buildGenreRows(
  movies: Movie[],
  limit?: number,
  minimumMovies = 2
): GenreRow[] {
  const genreMap = new Map<string, Movie[]>()

  for (const movie of movies) {
    const genres = parseGenres(movie)

    for (const genre of genres) {
      const existing = genreMap.get(genre) ?? []
      existing.push(movie)
      genreMap.set(genre, existing)
    }
  }

  const rows = Array.from(genreMap.entries())
    .filter(([, genreMovies]) => genreMovies.length >= minimumMovies)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([genre, genreMovies]) => ({ genre, movies: genreMovies }))

  if (limit) {
    return rows.slice(0, limit)
  }

  return rows
}

export function parseGenres(movie: Movie): string[] {
  if (!movie.genres) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(movie.genres)

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }

    return []
  } catch {
    return []
  }
}
