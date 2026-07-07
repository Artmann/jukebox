import { FetchHttpClient, HttpClient } from '@effect/platform'
import { Data, Effect } from 'effect'

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

class MetadataNotFound extends Data.TaggedError('MetadataNotFound')<{
  message: string
}> {}

class MetadataRequestFailed extends Data.TaggedError(
  'MetadataRequestFailed'
)<{
  message: string
}> {}

type MetadataError = MetadataNotFound | MetadataRequestFailed

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

// Warn-and-degrade: metadata is best-effort, so lookups keep answering null
// instead of failing the scan. The message text matches the old logger output.
const degradeToNull = (subject: string) => (error: MetadataError) =>
  Effect.logWarning(
    `Metadata lookup for ${subject} failed — continuing without metadata: ${error.message}`
  ).pipe(Effect.as(null))

export class Metadata extends Effect.Service<Metadata>()('jukebox/Metadata', {
  dependencies: [FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const apiGet = <Result>(
      path: string
    ): Effect.Effect<Result, MetadataError> =>
      Effect.gen(function* () {
        const response = yield* client.get(`${getApiBaseUrl()}${path}`)

        if (response.status === 404) {
          return yield* new MetadataNotFound({
            message: `Metadata API returned 404 for ${path}`
          })
        }

        if (response.status < 200 || response.status >= 300) {
          return yield* new MetadataRequestFailed({
            message: `Metadata API request failed with status ${response.status} for ${path}`
          })
        }

        return (yield* response.json) as Result
      }).pipe(
        Effect.scoped,
        Effect.catchTags({
          RequestError: (error) =>
            new MetadataRequestFailed({ message: error.message }),
          ResponseError: (error) =>
            new MetadataRequestFailed({ message: error.message })
        })
      )

    const fetchMovieByExternalId = (
      externalId: string
    ): Effect.Effect<MovieMetadata | null> =>
      apiGet<ApiMovie>(`/movies/${encodeURIComponent(externalId)}`).pipe(
        Effect.map(mapMovie),
        Effect.catchTags({
          MetadataNotFound: () => Effect.succeed(null),
          MetadataRequestFailed: degradeToNull(`movie id=${externalId}`)
        })
      )

    const fetchMovieMetadata = (
      title: string,
      year?: number
    ): Effect.Effect<MovieMetadata | null> =>
      Effect.gen(function* () {
        const search = new URLSearchParams({ title })

        if (year !== undefined) {
          search.set('year', year.toString())
        }

        const { results } = yield* apiGet<{ results: ApiMovie[] }>(
          `/movies/search?${search.toString()}`
        )

        const bestMatch = results[0]

        if (!bestMatch) {
          return null
        }

        // The search endpoint already returns full movie data including the
        // trailer URL, so no follow-up details call is needed.
        return mapMovie(bestMatch)
      }).pipe(
        Effect.catchAll(
          degradeToNull(`movie "${title}" (${year ?? 'no year'})`)
        )
      )

    const fetchSeasonMetadata = (
      externalId: string,
      seasonNumber: number
    ): Effect.Effect<SeasonMetadata | null> =>
      apiGet<ApiSeason>(
        `/shows/${encodeURIComponent(externalId)}/seasons/${seasonNumber}`
      ).pipe(
        Effect.map(mapSeason),
        Effect.catchTags({
          MetadataNotFound: () => Effect.succeed(null),
          MetadataRequestFailed: degradeToNull(
            `show id=${externalId} season=${seasonNumber}`
          )
        })
      )

    const fetchShowByExternalId = (
      externalId: string
    ): Effect.Effect<ShowMetadata | null> =>
      apiGet<ApiShow>(`/shows/${encodeURIComponent(externalId)}`).pipe(
        Effect.map(mapShow),
        Effect.catchTags({
          MetadataNotFound: () => Effect.succeed(null),
          MetadataRequestFailed: degradeToNull(`show id=${externalId}`)
        })
      )

    const fetchShowMetadata = (
      title: string,
      year?: number
    ): Effect.Effect<ShowMetadata | null> =>
      Effect.gen(function* () {
        const search = new URLSearchParams({ title })

        if (year !== undefined) {
          search.set('year', year.toString())
        }

        const { results } = yield* apiGet<{ results: ApiShow[] }>(
          `/shows/search?${search.toString()}`
        )

        const bestMatch = results[0]

        if (!bestMatch) {
          return null
        }

        return mapShow(bestMatch)
      }).pipe(
        Effect.catchAll(degradeToNull(`show "${title}" (${year ?? 'no year'})`))
      )

    return {
      fetchMovieByExternalId,
      fetchMovieMetadata,
      fetchSeasonMetadata,
      fetchShowByExternalId,
      fetchShowMetadata
    }
  })
}) {}
