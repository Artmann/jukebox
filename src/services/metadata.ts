import { log } from 'tiny-typescript-logger'

const defaultApiBaseUrl = 'https://movie-data-api.artgaard.workers.dev'

function getApiBaseUrl(): string {
  const fromEnv = process.env.JUKEBOX_METADATA_API_URL?.trim()

  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, '')
  }

  return defaultApiBaseUrl
}

interface ApiMovie {
  id: string
  title: string
  year: number | null
  overview: string
  runtime: number | null
  genres: string[]
  rating: number | null
  posterUrl: string | null
  backdropUrl: string | null
  trailerUrl: string | null
}

interface ApiShow {
  id: string
  title: string
  year: number | null
  overview: string
  genres: string[]
  rating: number | null
  posterUrl: string | null
  backdropUrl: string | null
  trailerUrl: string | null
  numberOfSeasons: number
}

interface ApiEpisode {
  episodeNumber: number
  title: string
  overview: string
  runtime: number | null
  stillUrl: string | null
}

interface ApiSeason {
  seasonNumber: number
  name: string
  overview: string
  posterUrl: string | null
  episodes: ApiEpisode[]
}

export interface MovieMetadata {
  externalId: string
  title: string
  year: number | null
  overview: string
  runtime: number | null
  genres: string
  rating: number | null
  posterUrl: string | null
  backdropUrl: string | null
  trailerUrl: string | null
}

export interface ShowMetadata {
  externalId: string
  title: string
  year: number | null
  overview: string
  genres: string
  rating: number | null
  posterUrl: string | null
  backdropUrl: string | null
  numberOfSeasons: number
}

export interface EpisodeMetadata {
  episodeNumber: number
  title: string
  overview: string
  runtime: number | null
  stillUrl: string | null
}

export interface SeasonMetadata {
  seasonNumber: number
  name: string
  overview: string
  posterUrl: string | null
  episodes: EpisodeMetadata[]
}

async function apiGet<Result>(path: string): Promise<Result> {
  const response = await fetch(`${getApiBaseUrl()}${path}`)

  if (response.status === 404) {
    throw new NotFoundError(path)
  }

  if (!response.ok) {
    throw new Error(
      `Metadata API request failed with status ${response.status} for ${path}`
    )
  }

  return (await response.json()) as Result
}

class NotFoundError extends Error {
  constructor(path: string) {
    super(`Metadata API returned 404 for ${path}`)
    this.name = 'NotFoundError'
  }
}

function mapMovie(apiMovie: ApiMovie): MovieMetadata {
  return {
    externalId: apiMovie.id,
    title: apiMovie.title,
    year: apiMovie.year,
    overview: apiMovie.overview,
    runtime: apiMovie.runtime,
    genres: JSON.stringify(apiMovie.genres),
    rating: apiMovie.rating,
    posterUrl: apiMovie.posterUrl,
    backdropUrl: apiMovie.backdropUrl,
    trailerUrl: apiMovie.trailerUrl
  }
}

function mapShow(apiShow: ApiShow): ShowMetadata {
  return {
    externalId: apiShow.id,
    title: apiShow.title,
    year: apiShow.year,
    overview: apiShow.overview,
    genres: JSON.stringify(apiShow.genres),
    rating: apiShow.rating,
    posterUrl: apiShow.posterUrl,
    backdropUrl: apiShow.backdropUrl,
    numberOfSeasons: apiShow.numberOfSeasons
  }
}

function mapSeason(apiSeason: ApiSeason): SeasonMetadata {
  return {
    seasonNumber: apiSeason.seasonNumber,
    name: apiSeason.name,
    overview: apiSeason.overview,
    posterUrl: apiSeason.posterUrl,
    episodes: apiSeason.episodes.map((episode) => ({
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      overview: episode.overview,
      runtime: episode.runtime,
      stillUrl: episode.stillUrl
    }))
  }
}

export async function fetchMovieMetadata(
  title: string,
  year?: number
): Promise<MovieMetadata | null> {
  try {
    const search = new URLSearchParams({ title })

    if (year !== undefined) {
      search.set('year', year.toString())
    }

    const { results } = await apiGet<{ results: ApiMovie[] }>(
      `/movies/search?${search.toString()}`
    )

    const bestMatch = results[0]

    if (!bestMatch) {
      return null
    }

    // The search endpoint already returns full movie data including the
    // trailer URL, so no follow-up details call is needed.
    return mapMovie(bestMatch)
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : 'Unknown error'

    log.warn(
      `Metadata lookup for movie "${title}" (${year ?? 'no year'}) failed — continuing without metadata: ${message}`
    )

    return null
  }
}

export async function fetchMovieByExternalId(
  externalId: string
): Promise<MovieMetadata | null> {
  try {
    const apiMovie = await apiGet<ApiMovie>(
      `/movies/${encodeURIComponent(externalId)}`
    )

    return mapMovie(apiMovie)
  } catch (caughtError) {
    if (caughtError instanceof NotFoundError) {
      return null
    }

    const message =
      caughtError instanceof Error ? caughtError.message : 'Unknown error'

    log.warn(
      `Metadata lookup for movie id=${externalId} failed — continuing without metadata: ${message}`
    )

    return null
  }
}

export async function fetchShowByExternalId(
  externalId: string
): Promise<ShowMetadata | null> {
  try {
    const apiShow = await apiGet<ApiShow>(
      `/shows/${encodeURIComponent(externalId)}`
    )

    return mapShow(apiShow)
  } catch (caughtError) {
    if (caughtError instanceof NotFoundError) {
      return null
    }

    const message =
      caughtError instanceof Error ? caughtError.message : 'Unknown error'

    log.warn(
      `Metadata lookup for show id=${externalId} failed — continuing without metadata: ${message}`
    )

    return null
  }
}

export async function fetchShowMetadata(
  title: string,
  year?: number
): Promise<ShowMetadata | null> {
  try {
    const search = new URLSearchParams({ title })

    if (year !== undefined) {
      search.set('year', year.toString())
    }

    const { results } = await apiGet<{ results: ApiShow[] }>(
      `/shows/search?${search.toString()}`
    )

    const bestMatch = results[0]

    if (!bestMatch) {
      return null
    }

    return mapShow(bestMatch)
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : 'Unknown error'

    log.warn(
      `Metadata lookup for show "${title}" (${year ?? 'no year'}) failed — continuing without metadata: ${message}`
    )

    return null
  }
}

export async function fetchSeasonMetadata(
  externalId: string,
  seasonNumber: number
): Promise<SeasonMetadata | null> {
  try {
    const apiSeason = await apiGet<ApiSeason>(
      `/shows/${encodeURIComponent(externalId)}/seasons/${seasonNumber}`
    )

    return mapSeason(apiSeason)
  } catch (caughtError) {
    if (caughtError instanceof NotFoundError) {
      return null
    }

    const message =
      caughtError instanceof Error ? caughtError.message : 'Unknown error'

    log.warn(
      `Metadata lookup for show id=${externalId} season=${seasonNumber} failed — continuing without metadata: ${message}`
    )

    return null
  }
}
