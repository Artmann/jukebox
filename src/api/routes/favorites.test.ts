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
const { favoriteRoutes } = await import('./favorites')

function buildApp(): Hono {
  const app = new Hono()
  app.use('*', profileMiddleware)
  app.route('/', favoriteRoutes)
  return app
}

const profileCookie = 'jukebox_profile_id=1'
const otherProfileCookie = 'jukebox_profile_id=2'

beforeEach(async () => {
  await testDb.db.delete(testDb.schema.favorites)
  await testDb.db.delete(testDb.schema.watchProgress)
  await testDb.db.delete(testDb.schema.movies)
  await testDb.db.delete(testDb.schema.profiles)

  await testDb.db.insert(testDb.schema.profiles).values([
    { id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) },
    { id: 2, name: 'Ada', emoji: '🚀', createdAt: new Date(1000) }
  ])

  await testDb.db.insert(testDb.schema.movies).values({
    id: 10,
    title: 'Inception',
    filePath: '/movies/inception.mp4',
    fileName: 'inception.mp4',
    createdAt: new Date(0),
    updatedAt: new Date(0)
  })
})

describe('favorites routes', () => {
  it('returns false when not favorited', async () => {
    const app = buildApp()
    const response = await app.request('/status?movieId=10', {
      headers: { cookie: profileCookie }
    })
    const body = (await response.json()) as { favorite: boolean }

    expect(body).toEqual({ favorite: false })
  })

  it('adds and lists a movie favorite', async () => {
    const app = buildApp()

    const post = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: profileCookie },
      body: JSON.stringify({ movieId: 10 })
    })

    expect(post.status).toEqual(200)

    const list = await app.request('/', {
      headers: { cookie: profileCookie }
    })
    const body = (await list.json()) as Array<{
      type: string
      movie: { id: number; title: string }
    }>

    expect(body.length).toEqual(1)
    expect(body[0]?.type).toEqual('movie')
    expect(body[0]?.movie.title).toEqual('Inception')
  })

  it('keeps favorites scoped per profile', async () => {
    const app = buildApp()

    await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: profileCookie },
      body: JSON.stringify({ movieId: 10 })
    })

    const otherStatus = await app.request('/status?movieId=10', {
      headers: { cookie: otherProfileCookie }
    })
    const otherBody = (await otherStatus.json()) as { favorite: boolean }

    expect(otherBody).toEqual({ favorite: false })
  })

  it('removes a favorite', async () => {
    const app = buildApp()

    await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: profileCookie },
      body: JSON.stringify({ movieId: 10 })
    })

    const remove = await app.request('/', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: profileCookie },
      body: JSON.stringify({ movieId: 10 })
    })

    expect(remove.status).toEqual(200)

    const status = await app.request('/status?movieId=10', {
      headers: { cookie: profileCookie }
    })
    const body = (await status.json()) as { favorite: boolean }

    expect(body).toEqual({ favorite: false })
  })

  it('rejects body with both movieId and showId', async () => {
    const app = buildApp()
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: profileCookie },
      body: JSON.stringify({ movieId: 10, showId: 1 })
    })

    expect(response.status).toEqual(400)
  })

  it('add is idempotent', async () => {
    const app = buildApp()

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: profileCookie },
        body: JSON.stringify({ movieId: 10 })
      })

      expect(response.status).toEqual(200)
    }

    const list = await app.request('/', {
      headers: { cookie: profileCookie }
    })
    const body = (await list.json()) as unknown[]

    expect(body.length).toEqual(1)
  })
})
