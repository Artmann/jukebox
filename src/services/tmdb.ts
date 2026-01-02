const TMDB_API_KEY = process.env.TMDB_API_KEY
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

export interface TMDBSearchResult {
  id: number
  title: string
  release_date: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
}

export interface TMDBMovieDetails {
  id: number
  title: string
  release_date: string
  overview: string
  runtime: number | null
  genres: { id: number; name: string }[]
  vote_average: number
  poster_path: string | null
  backdrop_path: string | null
}

export interface MovieMetadata {
  tmdbId: number
  title: string
  year: number | null
  overview: string
  runtime: number | null
  genres: string
  rating: number
  posterPath: string | null
  backdropPath: string | null
}

function checkApiKey(): void {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY environment variable is not set')
  }
}

export async function searchMovie(
  title: string,
  year?: number
): Promise<TMDBSearchResult[]> {
  checkApiKey()

  const params = new URLSearchParams({
    api_key: TMDB_API_KEY!,
    query: title
  })

  if (year) {
    params.set('year', year.toString())
  }

  const response = await fetch(
    `${TMDB_BASE_URL}/search/movie?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data.results as TMDBSearchResult[]
}

export async function getMovieDetails(
  tmdbId: number
): Promise<TMDBMovieDetails> {
  checkApiKey()

  const params = new URLSearchParams({
    api_key: TMDB_API_KEY!
  })

  const response = await fetch(
    `${TMDB_BASE_URL}/movie/${tmdbId}?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`TMDB movie details failed: ${response.statusText}`)
  }

  return response.json()
}

export function getPosterUrl(
  posterPath: string | null,
  size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string | null {
  if (!posterPath) return null
  return `${TMDB_IMAGE_BASE_URL}/${size}${posterPath}`
}

export function getBackdropUrl(
  backdropPath: string | null,
  size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280'
): string | null {
  if (!backdropPath) return null
  return `${TMDB_IMAGE_BASE_URL}/${size}${backdropPath}`
}

export async function fetchMovieMetadata(
  title: string,
  year?: number
): Promise<MovieMetadata | null> {
  try {
    checkApiKey()
  } catch {
    return null
  }

  const results = await searchMovie(title, year)

  if (results.length === 0 || !results[0]) {
    return null
  }

  // Get the first (best) match
  const bestMatch = results[0]
  const details = await getMovieDetails(bestMatch.id)

  const releaseYear = details.release_date
    ? parseInt(details.release_date.split('-')[0] ?? '0', 10) || null
    : null

  return {
    tmdbId: details.id,
    title: details.title,
    year: releaseYear,
    overview: details.overview,
    runtime: details.runtime,
    genres: JSON.stringify(details.genres.map((g) => g.name)),
    rating: details.vote_average,
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path
  }
}
