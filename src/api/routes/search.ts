import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { log } from 'tiny-typescript-logger'

import { db } from '../../database'
import { buildFtsMatchQuery } from '../../services/fts-query-parser'

const defaultLimit = 20
const maxLimit = 50

interface MovieResult {
  backdropPath: string | null
  id: number
  overview: string | null
  posterPath: string | null
  title: string
  year: number | null
}

interface ShowResult {
  backdropPath: string | null
  id: number
  overview: string | null
  posterPath: string | null
  title: string
  year: number | null
}

interface EpisodeResult {
  episodeNumber: number
  id: number
  overview: string | null
  seasonNumber: number
  showId: number
  showTitle: string
  stillPath: string | null
  title: string
}

interface SearchResponse {
  episodes: EpisodeResult[]
  indexEmpty: boolean
  movies: MovieResult[]
  shows: ShowResult[]
}

const searchRoutes = new Hono()

searchRoutes.get('/', (context) => {
  const queryParameter = context.req.query('q')

  if (queryParameter === undefined) {
    return context.json(
      {
        error: {
          message:
            'Add a `q` query parameter to search. Example: /api/search?q=dune'
        }
      },
      400
    )
  }

  const limitParameter = context.req.query('limit')
  const limit = parseLimit(limitParameter)

  if (limit === null) {
    return context.json(
      {
        error: {
          message: '`limit` must be a positive integer between 1 and 50.'
        }
      },
      400
    )
  }

  const matchExpression = buildFtsMatchQuery(queryParameter)

  if (matchExpression === null) {
    const empty: SearchResponse = {
      episodes: [],
      indexEmpty: false,
      movies: [],
      shows: []
    }
    return context.json(empty)
  }

  try {
    const movies = searchMovies(matchExpression, limit)
    const shows = searchShows(matchExpression, limit)
    const episodes = searchEpisodes(matchExpression, limit)

    const indexEmpty =
      movies.length === 0 &&
      shows.length === 0 &&
      episodes.length === 0 &&
      isLibraryEmpty()

    const response: SearchResponse = { episodes, indexEmpty, movies, shows }

    return context.json(response)
  } catch (error) {
    log.error('Search query failed.', error)

    return context.json(
      {
        error: {
          message:
            "Your search couldn't be parsed. Try simpler terms or fewer special characters."
        }
      },
      400
    )
  }
})

function isLibraryEmpty(): boolean {
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

function searchMovies(matchExpression: string, limit: number): MovieResult[] {
  const rows = db.all<{
    backdrop_path: string | null
    id: number
    overview: string | null
    poster_path: string | null
    title: string
    year: number | null
  }>(sql`
    SELECT
      movies.id AS id,
      movies.title AS title,
      movies.year AS year,
      movies.overview AS overview,
      movies.poster_path AS poster_path,
      movies.backdrop_path AS backdrop_path
    FROM movies_fts
    JOIN movies ON movies.rowid = movies_fts.rowid
    WHERE movies_fts MATCH ${matchExpression}
    ORDER BY bm25(movies_fts) ASC
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
    backdropPath: row.backdrop_path,
    id: row.id,
    overview: row.overview,
    posterPath: row.poster_path,
    title: row.title,
    year: row.year
  }))
}

function searchShows(matchExpression: string, limit: number): ShowResult[] {
  const rows = db.all<{
    backdrop_path: string | null
    id: number
    overview: string | null
    poster_path: string | null
    title: string
    year: number | null
  }>(sql`
    SELECT
      shows.id AS id,
      shows.title AS title,
      shows.year AS year,
      shows.overview AS overview,
      shows.poster_path AS poster_path,
      shows.backdrop_path AS backdrop_path
    FROM shows_fts
    JOIN shows ON shows.rowid = shows_fts.rowid
    WHERE shows_fts MATCH ${matchExpression}
    ORDER BY bm25(shows_fts) ASC
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
    backdropPath: row.backdrop_path,
    id: row.id,
    overview: row.overview,
    posterPath: row.poster_path,
    title: row.title,
    year: row.year
  }))
}

function searchEpisodes(
  matchExpression: string,
  limit: number
): EpisodeResult[] {
  const rows = db.all<{
    episode_number: number
    id: number
    overview: string | null
    season_number: number
    show_id: number
    show_title: string | null
    still_path: string | null
    title: string
  }>(sql`
    SELECT
      episodes.id AS id,
      episodes.show_id AS show_id,
      episodes.season_number AS season_number,
      episodes.episode_number AS episode_number,
      episodes.title AS title,
      episodes.overview AS overview,
      episodes.still_path AS still_path,
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
    stillPath: row.still_path,
    title: row.title
  }))
}

export { searchRoutes }
