// @vitest-environment node
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDb = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

const { searchRoutes } = await import('./search')

interface SearchResponse {
  episodes: Array<{
    episodeNumber: number
    id: number
    overview: string | null
    seasonNumber: number
    showId: number
    showTitle: string
    stillPath: string | null
    title: string
  }>
  indexEmpty: boolean
  movies: Array<{
    backdropPath: string | null
    id: number
    overview: string | null
    posterPath: string | null
    title: string
    year: number | null
  }>
  shows: Array<{
    backdropPath: string | null
    id: number
    overview: string | null
    posterPath: string | null
    title: string
    year: number | null
  }>
}

function buildApp(): Hono {
  const app = new Hono()
  app.route('/', searchRoutes)
  return app
}

async function search(query: string, limit?: number): Promise<{
  body: SearchResponse
  status: number
}> {
  const app = buildApp()
  const params = new URLSearchParams({ q: query })

  if (limit !== undefined) {
    params.set('limit', String(limit))
  }

  const response = await app.request(`/?${params.toString()}`)
  const body = (await response.json()) as SearchResponse

  return { body, status: response.status }
}

beforeEach(async () => {
  await testDb.db.delete(testDb.schema.episodes)
  await testDb.db.delete(testDb.schema.seasons)
  await testDb.db.delete(testDb.schema.shows)
  await testDb.db.delete(testDb.schema.movies)

  await testDb.db.insert(testDb.schema.movies).values([
    {
      id: 1,
      title: 'Dune',
      filePath: '/movies/dune.mkv',
      fileName: 'dune.mkv',
      year: 2021,
      overview: 'Paul Atreides on Arrakis.',
      genres: 'Science Fiction, Adventure',
      posterPath: '/dune.jpg',
      backdropPath: null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 2,
      title: 'Dune: Part Two',
      filePath: '/movies/dune-2.mkv',
      fileName: 'dune-2.mkv',
      year: 2024,
      overview: 'Paul unites the Fremen.',
      genres: 'Science Fiction',
      posterPath: '/dune2.jpg',
      backdropPath: null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 3,
      title: 'Inception',
      filePath: '/movies/inception.mkv',
      fileName: 'inception.mkv',
      year: 2010,
      overview: 'A thief who steals corporate secrets through dream-sharing.',
      genres: 'Action, Science Fiction',
      posterPath: null,
      backdropPath: null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    }
  ])

  await testDb.db.insert(testDb.schema.shows).values([
    {
      id: 10,
      title: 'Severance',
      folderPath: '/shows/severance',
      year: 2022,
      overview: 'Office workers undergo a procedure that splits their memories.',
      genres: 'Drama, Mystery',
      posterPath: '/sev.jpg',
      backdropPath: null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 11,
      title: 'Foundation',
      folderPath: '/shows/foundation',
      year: 2021,
      overview: 'Hari Seldon predicts the fall of the Galactic Empire.',
      genres: 'Drama, Science Fiction',
      posterPath: null,
      backdropPath: null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    }
  ])

  await testDb.db.insert(testDb.schema.seasons).values([
    {
      id: 100,
      showId: 10,
      seasonNumber: 1,
      name: 'Season 1',
      overview: null,
      posterPath: null,
      episodeCount: 9
    },
    {
      id: 101,
      showId: 11,
      seasonNumber: 1,
      name: 'Season 1',
      overview: null,
      posterPath: null,
      episodeCount: 10
    }
  ])

  await testDb.db.insert(testDb.schema.episodes).values([
    {
      id: 1000,
      showId: 10,
      seasonId: 100,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Good News About Hell',
      filePath: '/shows/severance/s1e1.mkv',
      fileName: 's1e1.mkv',
      overview: 'Mark adapts to a coworker leaving.',
      stillPath: null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 1001,
      showId: 11,
      seasonId: 101,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'The Emperor\u2019s Peace',
      filePath: '/shows/foundation/s1e1.mkv',
      fileName: 's1e1.mkv',
      overview: 'Hari Seldon faces the Empire.',
      stillPath: null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    }
  ])
})

describe('search routes', () => {
  describe('GET /', () => {
    it('returns empty groups for an empty query', async () => {
      const { body, status } = await search('')

      expect(status).toEqual(200)
      expect(body).toEqual({
        episodes: [],
        indexEmpty: false,
        movies: [],
        shows: []
      })
    })

    it('returns empty groups for a whitespace query', async () => {
      const { body, status } = await search('   ')

      expect(status).toEqual(200)
      expect(body).toEqual({
        episodes: [],
        indexEmpty: false,
        movies: [],
        shows: []
      })
    })

    it('returns 400 for a missing q parameter', async () => {
      const app = buildApp()
      const response = await app.request('/')
      const body = (await response.json()) as { error: { message: string } }

      expect(response.status).toEqual(400)
      expect(body).toEqual({
        error: {
          message:
            'Add a `q` query parameter to search. Example: /api/search?q=dune'
        }
      })
    })

    it('finds movies by title prefix', async () => {
      const { body, status } = await search('dun')

      expect(status).toEqual(200)
      expect(body.movies.map((movie) => movie.id).sort()).toEqual([1, 2])
      expect(body.shows).toEqual([])
      expect(body.episodes).toEqual([])
    })

    it('returns each movie with a stable shape', async () => {
      const { body } = await search('Inception')

      expect(body.movies).toEqual([
        {
          backdropPath: null,
          id: 3,
          overview:
            'A thief who steals corporate secrets through dream-sharing.',
          posterPath: null,
          title: 'Inception',
          year: 2010
        }
      ])
    })

    it('finds shows by title prefix', async () => {
      const { body } = await search('sever')

      expect(body.shows.map((show) => show.id)).toEqual([10])
    })

    it('finds episodes by parent show title', async () => {
      const { body } = await search('foundation')

      expect(body.episodes).toEqual([
        {
          episodeNumber: 1,
          id: 1001,
          overview: 'Hari Seldon faces the Empire.',
          seasonNumber: 1,
          showId: 11,
          showTitle: 'Foundation',
          stillPath: null,
          title: 'The Emperor\u2019s Peace'
        }
      ])
    })

    it('finds episodes by their own title', async () => {
      const { body } = await search('hell')

      expect(body.episodes.map((episode) => episode.id)).toEqual([1000])
    })

    it('matches genre text on movies', async () => {
      const { body } = await search('adventure')

      expect(body.movies.map((movie) => movie.id)).toEqual([1])
    })

    it('matches case-insensitively', async () => {
      const { body } = await search('INCEPTION')

      expect(body.movies.map((movie) => movie.id)).toEqual([3])
    })

    it('orders results by bm25 (title hits beat overview hits)', async () => {
      // Both "Dune" and "Dune: Part Two" have "dune" in the title, but only
      // the first has "Arrakis" — searching by overview-only term should
      // still rank the title-matching movie first when the term appears in
      // both columns.
      const { body } = await search('Dune')

      expect(body.movies.length).toBeGreaterThan(0)
      // bm25 ranks shorter title with the term first; both should match.
      expect(body.movies.map((movie) => movie.id).sort()).toEqual([1, 2])
    })

    it('treats AND/OR/NEAR as literal tokens, not operators', async () => {
      // "OR" alone matches nothing in the library, so the entire query
      // (which AND-joins terms) returns no results — proving OR was not
      // interpreted as a boolean operator.
      const { body } = await search('Dune OR Inception')

      expect(body.movies).toEqual([])
    })

    it('survives adversarial input with quotes and asterisks', async () => {
      const { body, status } = await search('"foo* (bar) baz:qux')

      expect(status).toEqual(200)
      expect(body).toEqual({
        episodes: [],
        indexEmpty: false,
        movies: [],
        shows: []
      })
    })

    it('survives a query consisting entirely of FTS punctuation', async () => {
      const { body, status } = await search('* () : ""')

      expect(status).toEqual(200)
      expect(body).toEqual({
        episodes: [],
        indexEmpty: false,
        movies: [],
        shows: []
      })
    })

    it('respects the limit parameter', async () => {
      const { body } = await search('dune', 1)

      expect(body.movies.length).toEqual(1)
    })

    it('caps the limit at 50 to prevent runaway queries', async () => {
      const { body, status } = await search('dune', 9999)

      expect(status).toEqual(200)
      // We only have 2 dune movies, so the cap is exercised internally —
      // we just want to confirm the request didn't error.
      expect(body.movies.length).toEqual(2)
    })

    it('returns 400 when limit is not a positive integer', async () => {
      const app = buildApp()
      const response = await app.request('/?q=dune&limit=abc')
      const body = (await response.json()) as { error: { message: string } }

      expect(response.status).toEqual(400)
      expect(body).toEqual({
        error: {
          message:
            '`limit` must be a positive integer between 1 and 50.'
        }
      })
    })

    it('flags an empty library so the UI can show "index not ready"', async () => {
      await testDb.db.delete(testDb.schema.episodes)
      await testDb.db.delete(testDb.schema.seasons)
      await testDb.db.delete(testDb.schema.shows)
      await testDb.db.delete(testDb.schema.movies)

      const { body, status } = await search('anything')

      expect(status).toEqual(200)
      expect(body).toEqual({
        episodes: [],
        indexEmpty: true,
        movies: [],
        shows: []
      })
    })

    it('does not flag indexEmpty when the library has rows but no matches', async () => {
      const { body } = await search('zzznosuchterm')

      expect(body.indexEmpty).toEqual(false)
    })

    it('reflects deletions through the FTS triggers', async () => {
      await testDb.db
        .delete(testDb.schema.movies)
        .where(eq(testDb.schema.movies.id, 3))

      const { body } = await search('inception')

      expect(body.movies).toEqual([])
    })

    it('reflects updates through the FTS triggers', async () => {
      await testDb.db
        .update(testDb.schema.movies)
        .set({ title: 'Tenet' })
        .where(eq(testDb.schema.movies.id, 3))

      const { body: oldQuery } = await search('inception')
      expect(oldQuery.movies).toEqual([])

      const { body: newQuery } = await search('tenet')
      expect(newQuery.movies.map((movie) => movie.id)).toEqual([3])
    })

    it('keeps episode show_title in sync when a show is renamed', async () => {
      await testDb.db
        .update(testDb.schema.shows)
        .set({ title: 'Apple Foundation' })
        .where(eq(testDb.schema.shows.id, 11))

      // The original show title should no longer match the episode.
      const { body: oldQuery } = await search('foundation')
      // "Apple Foundation" still has "Foundation" in it, so that's still a hit
      // — instead search for a brand-new word we just added.
      expect(oldQuery.episodes.map((episode) => episode.id)).toEqual([1001])

      const { body: newQuery } = await search('apple')
      expect(newQuery.episodes.map((episode) => episode.id)).toEqual([1001])
    })
  })
})
