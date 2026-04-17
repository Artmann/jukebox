// @vitest-environment node
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDb = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

const { profileMiddleware } = await import('../middleware/profile')
const { upNextRoutes } = await import('./up-next')
const { showRoutes } = await import('./shows')

function buildUpNextApp(): Hono {
  const app = new Hono()
  app.use('*', profileMiddleware)
  app.route('/', upNextRoutes)
  return app
}

function buildShowsApp(): Hono {
  const app = new Hono()
  app.use('*', profileMiddleware)
  app.route('/', showRoutes)
  return app
}

const profileCookie = 'jukebox_profile_id=1'

interface UpNextResponseItem {
  episode: { id: number; seasonNumber: number; episodeNumber: number }
  show: { id: number; title: string }
  lastWatchedAt: string
}

interface NextEpisodeResponse {
  episode: { id: number; seasonNumber: number; episodeNumber: number }
  show: { id: number; title: string }
}

beforeEach(async () => {
  await testDb.db.delete(testDb.schema.watchProgress)
  await testDb.db.delete(testDb.schema.episodes)
  await testDb.db.delete(testDb.schema.seasons)
  await testDb.db.delete(testDb.schema.shows)
  await testDb.db.delete(testDb.schema.profiles)

  await testDb.db.insert(testDb.schema.profiles).values({
    id: 1,
    name: 'Default',
    emoji: '🍿',
    createdAt: new Date(0)
  })

  await testDb.db.insert(testDb.schema.shows).values([
    {
      id: 100,
      title: 'Alpha',
      folderPath: '/shows/alpha',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 200,
      title: 'Beta',
      folderPath: '/shows/beta',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    }
  ])

  await testDb.db.insert(testDb.schema.seasons).values([
    { id: 1, showId: 100, seasonNumber: 1 },
    { id: 2, showId: 100, seasonNumber: 2 },
    { id: 3, showId: 200, seasonNumber: 1 }
  ])

  await testDb.db.insert(testDb.schema.episodes).values([
    {
      id: 1001,
      showId: 100,
      seasonId: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Alpha S1E1',
      filePath: '/shows/alpha/s1e1.mp4',
      fileName: 's1e1.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 1002,
      showId: 100,
      seasonId: 1,
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'Alpha S1E2',
      filePath: '/shows/alpha/s1e2.mp4',
      fileName: 's1e2.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 1003,
      showId: 100,
      seasonId: 2,
      seasonNumber: 2,
      episodeNumber: 1,
      title: 'Alpha S2E1',
      filePath: '/shows/alpha/s2e1.mp4',
      fileName: 's2e1.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    },
    {
      id: 2001,
      showId: 200,
      seasonId: 3,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Beta S1E1',
      filePath: '/shows/beta/s1e1.mp4',
      fileName: 's1e1.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    }
  ])
})

describe('GET /api/library/up-next', () => {
  it('returns empty list when the profile has no progress', async () => {
    const app = buildUpNextApp()

    const response = await app.request('/', {
      headers: { cookie: profileCookie }
    })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as UpNextResponseItem[]
    expect(body).toEqual([])
  })

  it('skips shows whose most-recent episode is mid-watch', async () => {
    const app = buildUpNextApp()

    await testDb.db.insert(testDb.schema.watchProgress).values({
      profileId: 1,
      episodeId: 1001,
      currentTime: 100,
      duration: 600,
      updatedAt: new Date(10_000)
    })

    const response = await app.request('/', {
      headers: { cookie: profileCookie }
    })
    const body = (await response.json()) as UpNextResponseItem[]

    expect(body).toEqual([])
  })

  it('returns the next episode when the last watched is complete', async () => {
    const app = buildUpNextApp()

    await testDb.db.insert(testDb.schema.watchProgress).values({
      profileId: 1,
      episodeId: 1001,
      currentTime: 580,
      duration: 600,
      updatedAt: new Date(20_000)
    })

    const response = await app.request('/', {
      headers: { cookie: profileCookie }
    })
    const body = (await response.json()) as UpNextResponseItem[]

    expect(body.length).toEqual(1)
    expect(body[0]?.episode.id).toEqual(1002)
    expect(body[0]?.show.id).toEqual(100)
  })

  it('crosses season boundaries when a season is finished', async () => {
    const app = buildUpNextApp()

    await testDb.db.insert(testDb.schema.watchProgress).values([
      {
        profileId: 1,
        episodeId: 1001,
        currentTime: 600,
        duration: 600,
        updatedAt: new Date(30_000)
      },
      {
        profileId: 1,
        episodeId: 1002,
        currentTime: 600,
        duration: 600,
        updatedAt: new Date(40_000)
      }
    ])

    const response = await app.request('/', {
      headers: { cookie: profileCookie }
    })
    const body = (await response.json()) as UpNextResponseItem[]

    expect(body.length).toEqual(1)
    expect(body[0]?.episode.id).toEqual(1003)
  })
})

describe('GET /api/library/shows/:showId/next-episode', () => {
  it('returns the next episode in order', async () => {
    const app = buildShowsApp()

    const response = await app.request('/100/next-episode?afterEpisodeId=1001', {
      headers: { cookie: profileCookie }
    })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as NextEpisodeResponse
    expect(body.episode.id).toEqual(1002)
  })

  it('returns the literal next episode even if it has been watched', async () => {
    const app = buildShowsApp()

    await testDb.db.insert(testDb.schema.watchProgress).values({
      profileId: 1,
      episodeId: 1002,
      currentTime: 595,
      duration: 600,
      updatedAt: new Date(50_000)
    })

    const response = await app.request('/100/next-episode?afterEpisodeId=1001', {
      headers: { cookie: profileCookie }
    })

    const body = (await response.json()) as NextEpisodeResponse
    expect(body.episode.id).toEqual(1002)
  })

  it('returns 404 when there is no next episode', async () => {
    const app = buildShowsApp()

    const response = await app.request('/100/next-episode?afterEpisodeId=1003', {
      headers: { cookie: profileCookie }
    })

    expect(response.status).toEqual(404)
  })

  it('returns 400 when afterEpisodeId is missing', async () => {
    const app = buildShowsApp()

    const response = await app.request('/100/next-episode', {
      headers: { cookie: profileCookie }
    })

    expect(response.status).toEqual(400)
  })

  it('returns 404 when the episode is on a different show', async () => {
    const app = buildShowsApp()

    const response = await app.request('/100/next-episode?afterEpisodeId=2001', {
      headers: { cookie: profileCookie }
    })

    expect(response.status).toEqual(404)
  })
})
