import { getConfig } from '../config'

const tmdbBaseUrl = 'https://api.themoviedb.org/3'
const tmdbImageBaseUrl = 'https://image.tmdb.org/t/p'

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

export interface TMDBVideo {
  id: string
  key: string
  name: string
  site: string
  type: string
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
  trailerUrl: string | null
}

export interface TMDBShowSearchResult {
  id: number
  name: string
  first_air_date: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
}

export interface TMDBShowDetails {
  id: number
  name: string
  first_air_date: string
  overview: string
  genres: { id: number; name: string }[]
  vote_average: number
  poster_path: string | null
  backdrop_path: string | null
  number_of_seasons: number
}

export interface TMDBSeasonDetails {
  season_number: number
  name: string
  overview: string
  poster_path: string | null
  episodes: TMDBEpisodeDetails[]
}

export interface TMDBEpisodeDetails {
  episode_number: number
  name: string
  overview: string
  runtime: number | null
  still_path: string | null
  air_date: string | null
}

export interface ShowMetadata {
  tmdbId: number
  title: string
  year: number | null
  overview: string
  genres: string
  rating: number
  posterPath: string | null
  backdropPath: string | null
  numberOfSeasons: number
}

export interface SeasonMetadata {
  seasonNumber: number
  name: string
  overview: string
  posterPath: string | null
  episodes: EpisodeMetadata[]
}

export interface EpisodeMetadata {
  episodeNumber: number
  title: string
  overview: string
  runtime: number | null
  stillPath: string | null
}

function getApiKey(): string {
  const config = getConfig()
  const apiKey = config?.tmdbApiKey ?? process.env.TMDB_API_KEY ?? null

  if (!apiKey) {
    throw new Error('TMDB API key is not configured')
  }

  return apiKey
}

export async function searchMovie(
  title: string,
  year?: number
): Promise<TMDBSearchResult[]> {
  const apiKey = getApiKey()

  const params = new URLSearchParams({
    api_key: apiKey,
    query: title
  })

  if (year) {
    params.set('year', year.toString())
  }

  const response = await fetch(
    `${tmdbBaseUrl}/search/movie?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.statusText}`)
  }

  const data = (await response.json()) as { results: TMDBSearchResult[] }

  return data.results
}

export async function getMovieDetails(
  tmdbId: number
): Promise<TMDBMovieDetails> {
  const apiKey = getApiKey()

  const params = new URLSearchParams({
    api_key: apiKey
  })

  const response = await fetch(
    `${tmdbBaseUrl}/movie/${tmdbId}?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`TMDB movie details failed: ${response.statusText}`)
  }

  return (await response.json()) as TMDBMovieDetails
}

export async function getMovieVideos(tmdbId: number): Promise<TMDBVideo[]> {
  const apiKey = getApiKey()

  const params = new URLSearchParams({
    api_key: apiKey
  })

  const response = await fetch(
    `${tmdbBaseUrl}/movie/${tmdbId}/videos?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`TMDB movie videos failed: ${response.statusText}`)
  }

  const data = (await response.json()) as { results: TMDBVideo[] }

  return data.results
}

export function getTrailerUrl(videos: TMDBVideo[]): string | null {
  const youtubeVideos = videos.filter((v) => v.site === 'YouTube')

  // Priority: Trailer > Teaser > Clip > any other
  const priorities = ['Trailer', 'Teaser', 'Clip']

  for (const type of priorities) {
    const video = youtubeVideos.find((v) => v.type === type)
    if (video) {
      return `https://www.youtube.com/watch?v=${video.key}`
    }
  }

  // Fallback to any YouTube video
  if (youtubeVideos.length > 0 && youtubeVideos[0]) {
    return `https://www.youtube.com/watch?v=${youtubeVideos[0].key}`
  }

  return null
}

export function getPosterUrl(
  posterPath: string | null,
  size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string | null {
  if (!posterPath) return null
  return `${tmdbImageBaseUrl}/${size}${posterPath}`
}

export function getBackdropUrl(
  backdropPath: string | null,
  size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280'
): string | null {
  if (!backdropPath) return null
  return `${tmdbImageBaseUrl}/${size}${backdropPath}`
}

export async function fetchMovieMetadata(
  title: string,
  year?: number
): Promise<MovieMetadata | null> {
  try {
    getApiKey()
  } catch {
    return null
  }

  const results = await searchMovie(title, year)

  if (results.length === 0 || !results[0]) {
    return null
  }

  // Get the first (best) match
  const bestMatch = results[0]
  const [details, videos] = await Promise.all([
    getMovieDetails(bestMatch.id),
    getMovieVideos(bestMatch.id)
  ])

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
    backdropPath: details.backdrop_path,
    trailerUrl: getTrailerUrl(videos)
  }
}

export async function searchShow(
  title: string,
  year?: number
): Promise<TMDBShowSearchResult[]> {
  const apiKey = getApiKey()

  const params = new URLSearchParams({
    api_key: apiKey,
    query: title
  })

  if (year) {
    params.set('first_air_date_year', year.toString())
  }

  const response = await fetch(`${tmdbBaseUrl}/search/tv?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`TMDB TV search failed: ${response.statusText}`)
  }

  const data = (await response.json()) as { results: TMDBShowSearchResult[] }

  return data.results
}

export async function getShowDetails(tmdbId: number): Promise<TMDBShowDetails> {
  const apiKey = getApiKey()

  const params = new URLSearchParams({
    api_key: apiKey
  })

  const response = await fetch(
    `${tmdbBaseUrl}/tv/${tmdbId}?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`TMDB show details failed: ${response.statusText}`)
  }

  return (await response.json()) as TMDBShowDetails
}

export async function getSeasonDetails(
  tmdbId: number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> {
  const apiKey = getApiKey()

  const params = new URLSearchParams({
    api_key: apiKey
  })

  const response = await fetch(
    `${tmdbBaseUrl}/tv/${tmdbId}/season/${seasonNumber}?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(`TMDB season details failed: ${response.statusText}`)
  }

  return (await response.json()) as TMDBSeasonDetails
}

export async function fetchShowMetadata(
  title: string,
  year?: number
): Promise<ShowMetadata | null> {
  try {
    getApiKey()
  } catch {
    return null
  }

  const results = await searchShow(title, year)

  if (results.length === 0 || !results[0]) {
    return null
  }

  const bestMatch = results[0]
  const details = await getShowDetails(bestMatch.id)

  const firstAirYear = details.first_air_date
    ? parseInt(details.first_air_date.split('-')[0] ?? '0', 10) || null
    : null

  return {
    tmdbId: details.id,
    title: details.name,
    year: firstAirYear,
    overview: details.overview,
    genres: JSON.stringify(details.genres.map((g) => g.name)),
    rating: details.vote_average,
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    numberOfSeasons: details.number_of_seasons
  }
}

export async function fetchSeasonMetadata(
  tmdbId: number,
  seasonNumber: number
): Promise<SeasonMetadata | null> {
  try {
    getApiKey()
  } catch {
    return null
  }

  const details = await getSeasonDetails(tmdbId, seasonNumber)

  return {
    seasonNumber: details.season_number,
    name: details.name,
    overview: details.overview,
    posterPath: details.poster_path,
    episodes: details.episodes.map((episode) => ({
      episodeNumber: episode.episode_number,
      title: episode.name,
      overview: episode.overview,
      runtime: episode.runtime,
      stillPath: episode.still_path
    }))
  }
}
