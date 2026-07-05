import { HttpApiBuilder } from '@effect/platform'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database, type DrizzleDatabase } from '../../database/layer'
import { buildFtsMatchQuery } from '../../services/fts-query-parser'
import { jukeboxApi } from '../contract'
import { BadRequest } from '../contract/errors'
import type {
  SearchEpisodeResult,
  SearchMovieResult,
  SearchResult,
  SearchShowResult
} from '../contract/schemas'

import { withInternalFallback } from './support'

const defaultLimit = 20
const maxLimit = 50
const maxQueryLength = 256

function isLibraryEmpty(db: DrizzleDatabase): boolean {
  const [movieCountRow] = db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM movies
  `)
  const [showCountRow] = db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM shows
  `)
  const [episodeCountRow] = db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM episodes
  `)

  const total =
    (movieCountRow?.count ?? 0) +
    (showCountRow?.count ?? 0) +
    (episodeCountRow?.count ?? 0)

  return total === 0
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') {
    return defaultLimit
  }

  const parsed = Number(raw)

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null
  }

  return Math.min(parsed, maxLimit)
}

function searchMovies(
  db: DrizzleDatabase,
  matchExpression: string,
  limit: number
): SearchMovieResult[] {
  const rows = db.all<{
    backdrop_url: string | null
    id: number
    overview: string | null
    poster_url: string | null
    title: string
    year: number | null
  }>(sql`
    SELECT
      movies.id AS id,
      movies.title AS title,
      movies.year AS year,
      movies.overview AS overview,
      movies.poster_url AS poster_url,
      movies.backdrop_url AS backdrop_url
    FROM movies_fts
    JOIN movies ON movies.rowid = movies_fts.rowid
    WHERE movies_fts MATCH ${matchExpression}
    ORDER BY bm25(movies_fts) ASC
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
    backdropUrl: row.backdrop_url,
    id: row.id,
    overview: row.overview,
    posterUrl: row.poster_url,
    title: row.title,
    year: row.year
  }))
}

function searchShows(
  db: DrizzleDatabase,
  matchExpression: string,
  limit: number
): SearchShowResult[] {
  const rows = db.all<{
    backdrop_url: string | null
    id: number
    overview: string | null
    poster_url: string | null
    title: string
    year: number | null
  }>(sql`
    SELECT
      shows.id AS id,
      shows.title AS title,
      shows.year AS year,
      shows.overview AS overview,
      shows.poster_url AS poster_url,
      shows.backdrop_url AS backdrop_url
    FROM shows_fts
    JOIN shows ON shows.rowid = shows_fts.rowid
    WHERE shows_fts MATCH ${matchExpression}
    ORDER BY bm25(shows_fts) ASC
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
    backdropUrl: row.backdrop_url,
    id: row.id,
    overview: row.overview,
    posterUrl: row.poster_url,
    title: row.title,
    year: row.year
  }))
}

function searchEpisodes(
  db: DrizzleDatabase,
  matchExpression: string,
  limit: number
): SearchEpisodeResult[] {
  const rows = db.all<{
    episode_number: number
    id: number
    overview: string | null
    season_number: number
    show_id: number
    show_title: string | null
    still_url: string | null
    title: string
  }>(sql`
    SELECT
      episodes.id AS id,
      episodes.show_id AS show_id,
      episodes.season_number AS season_number,
      episodes.episode_number AS episode_number,
      episodes.title AS title,
      episodes.overview AS overview,
      episodes.still_url AS still_url,
      shows.title AS show_title
    FROM episodes_fts
    JOIN episodes ON episodes.rowid = episodes_fts.rowid
    LEFT JOIN shows ON shows.id = episodes.show_id
    WHERE episodes_fts MATCH ${matchExpression}
    ORDER BY bm25(episodes_fts) ASC
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
    episodeNumber: row.episode_number,
    id: row.id,
    overview: row.overview,
    seasonNumber: row.season_number,
    showId: row.show_id,
    showTitle: row.show_title ?? '',
    stillUrl: row.still_url,
    title: row.title
  }))
}

function runSearch(
  db: DrizzleDatabase,
  matchExpression: string,
  limit: number
): SearchResult {
  const movies = searchMovies(db, matchExpression, limit)
  const shows = searchShows(db, matchExpression, limit)
  const episodes = searchEpisodes(db, matchExpression, limit)

  const indexEmpty =
    movies.length === 0 &&
    shows.length === 0 &&
    episodes.length === 0 &&
    isLibraryEmpty(db)

  return { episodes, indexEmpty, movies, shows }
}

// Ports src/api/routes/search.ts, including the hand-written hint for a
// request without `q` — the contract keeps `q` optional so the handler can
// answer with today's exact message instead of a schema decode summary.
export const searchHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'search',
  (handlers) =>
    handlers.handle('search', ({ urlParams }) =>
      withInternalFallback(
        Effect.gen(function* () {
          const query = urlParams.q

          if (query === undefined) {
            return yield* Effect.fail(
              new BadRequest({
                message:
                  'Add a `q` query parameter to search. Example: /api/search?q=dune'
              })
            )
          }

          if (query.length > maxQueryLength) {
            return yield* Effect.fail(
              new BadRequest({
                message:
                  'Search query is too long. Shorten it to under 256 characters.'
              })
            )
          }

          const limit = parseLimit(urlParams.limit)

          if (limit === null) {
            return yield* Effect.fail(
              new BadRequest({
                message: '`limit` must be a positive integer between 1 and 50.'
              })
            )
          }

          const matchExpression = buildFtsMatchQuery(query)

          if (matchExpression === null) {
            return { episodes: [], indexEmpty: false, movies: [], shows: [] }
          }

          const db = yield* Database

          return yield* Effect.try({
            catch: (error) => {
              console.error('Search query failed.', error)

              return new BadRequest({
                message:
                  "Your search couldn't be parsed. Try simpler terms or fewer special characters."
              })
            },
            try: () => runSearch(db, matchExpression, limit)
          })
        })
      )
    )
)
