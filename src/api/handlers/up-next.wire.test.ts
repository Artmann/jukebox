// @vitest-environment node

// Wire tests for the up-next group and the next-episode route, ported from
// the Hono route tests in src/api/routes/up-next.test.ts. The mid-watch skip,
// next-unwatched, no-next-episode 404, and wrong-show 404 cases are covered
// by handlers.test.ts ('up next group' and 'shows group') and are not
// repeated here.
import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { Layer } from 'effect'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDatabase.db,
  schema: testDatabase.schema
}))

const { databaseTestLayer } = await import('../../database/layer')
const { apiLive, decodeErrorRemapLive, rawRoutesLive } = await import(
  '../../http/app'
)

const { dispose, handler } = HttpApiBuilder.toWebHandler(
  Layer.mergeAll(
    apiLive.pipe(Layer.provide(databaseTestLayer(testDatabase.db))),
    rawRoutesLive.pipe(Layer.provide(databaseTestLayer(testDatabase.db))),
    decodeErrorRemapLive,
    NodeHttpServer.layerContext
  )
)

const { db, schema } = testDatabase
const profileCookie = 'jukebox_profile_id=1'

interface NextEpisodeResponse {
  episode: { episodeNumber: number; id: number; seasonNumber: number }
  show: { id: number; title: string }
}

interface UpNextResponseItem {
  episode: { episodeNumber: number; id: number; seasonNumber: number }
  lastWatchedAt: string
  show: { id: number; title: string }
}

function get(path: string) {
  return handler(
    new Request(`http://localhost/api/library${path}`, {
      headers: { cookie: profileCookie }
    })
  )
}

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  await db.delete(schema.watchProgress)
  await db.delete(schema.episodes)
  await db.delete(schema.seasons)
  await db.delete(schema.shows)
  await db.delete(schema.profiles)

  await db
    .insert(schema.profiles)
    .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })

  await db.insert(schema.shows).values([
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

  await db.insert(schema.seasons).values([
    { id: 1, showId: 100, seasonNumber: 1 },
    { id: 2, showId: 100, seasonNumber: 2 },
    { id: 3, showId: 200, seasonNumber: 1 }
  ])

  await db.insert(schema.episodes).values([
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
    const response = await get('/up-next')

    expect(response.status).toEqual(200)

    const body = (await response.json()) as UpNextResponseItem[]

    expect(body).toEqual([])
  })

  it('crosses season boundaries when a season is finished', async () => {
    await db.insert(schema.watchProgress).values([
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

    const response = await get('/up-next')
    const body = (await response.json()) as UpNextResponseItem[]

    expect(body.length).toEqual(1)
    expect(body[0]?.episode.id).toEqual(1003)
  })
})

describe('GET /api/library/shows/:showId/next-episode', () => {
  it('returns the literal next episode even if it has been watched', async () => {
    await db.insert(schema.watchProgress).values({
      profileId: 1,
      episodeId: 1002,
      currentTime: 595,
      duration: 600,
      updatedAt: new Date(50_000)
    })

    const response = await get('/shows/100/next-episode?afterEpisodeId=1001')
    const body = (await response.json()) as NextEpisodeResponse

    expect(body.episode.id).toEqual(1002)
  })

  it('returns 400 when afterEpisodeId is missing', async () => {
    const response = await get('/shows/100/next-episode')

    expect(response.status).toEqual(400)
  })
})
