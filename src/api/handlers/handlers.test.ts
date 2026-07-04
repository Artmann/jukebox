// @vitest-environment node

// End-to-end wire tests for the Effect HttpApi: requests go through
// HttpApiBuilder.toWebHandler with the real middleware, the decode-error
// remap, and an in-memory database — no socket, no mocks besides the
// database singleton (swapped for the in-memory instance, same pattern as
// the existing Hono route tests).
import { HttpApiBuilder, HttpServer } from '@effect/platform'
import { Layer } from 'effect'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDatabase.db,
  schema: testDatabase.schema
}))

const { databaseTestLayer } = await import('../../database/layer')
const { apiLive, decodeErrorRemapLive } = await import('../../http/app')

const { dispose, handler } = HttpApiBuilder.toWebHandler(
  Layer.mergeAll(
    apiLive.pipe(Layer.provide(databaseTestLayer(testDatabase.db))),
    decodeErrorRemapLive,
    HttpServer.layerContext
  )
)

const { db, schema } = testDatabase
const profileCookie = 'jukebox_profile_id=1'

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  await db.delete(schema.favorites)
  await db.delete(schema.watchProgress)
  await db.delete(schema.sessions)
  await db.delete(schema.authConfig)
  await db.delete(schema.movies)
  await db.delete(schema.profiles)
})

describe('hello group', () => {
  it('serves the root /api route without touching the profile cookie', async () => {
    const response = await handler(new Request('http://localhost/api'))

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({ message: 'Jukebox API' })
    expect(response.headers.get('set-cookie')).toEqual(null)
  })
})

describe('profile middleware', () => {
  it('creates a default profile and sets the cookie on first request', async () => {
    const response = await handler(
      new Request('http://localhost/api/profiles')
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('set-cookie') ?? '').toContain(
      'jukebox_profile_id='
    )
    expect(await response.json()).toEqual([
      {
        createdAt: expect.any(String) as string,
        emoji: '🍿',
        id: expect.any(Number) as number,
        name: 'Default'
      }
    ])
  })

  it('does not set the cookie when a valid one is sent', async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })

    const response = await handler(
      new Request('http://localhost/api/profiles', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('set-cookie')).toEqual(null)
  })
})

describe('favorites group', () => {
  beforeEach(async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })

    await db.insert(schema.movies).values({
      id: 10,
      title: 'Inception',
      filePath: '/movies/inception.mp4',
      fileName: 'inception.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    })
  })

  it('round-trips a movie favorite through POST and GET', async () => {
    const post = await handler(
      new Request('http://localhost/api/favorites', {
        body: JSON.stringify({ movieId: 10 }),
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'POST'
      })
    )

    expect(post.status).toEqual(200)
    expect(await post.json()).toEqual({ success: true })

    const list = await handler(
      new Request('http://localhost/api/favorites', {
        headers: { cookie: profileCookie }
      })
    )

    expect(list.status).toEqual(200)
    expect(await list.json()).toEqual([
      {
        createdAt: expect.any(String) as string,
        movie: {
          backdropUrl: null,
          createdAt: '1970-01-01T00:00:00.000Z',
          extension: null,
          externalId: null,
          fileName: 'inception.mp4',
          filePath: '/movies/inception.mp4',
          fileSize: null,
          genres: null,
          id: 10,
          overview: null,
          posterUrl: null,
          rating: null,
          runtime: null,
          title: 'Inception',
          trailerUrl: null,
          updatedAt: '1970-01-01T00:00:00.000Z',
          year: null
        },
        type: 'movie'
      }
    ])
  })
})

describe('auth group', () => {
  it('reports auth disabled and authenticated when no password is set', async () => {
    const response = await handler(
      new Request('http://localhost/api/auth/status')
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      authenticated: true,
      enabled: false
    })
  })
})

describe('auth middleware', () => {
  it('answers 401 with the exact wire body when a password is set', async () => {
    await db.insert(schema.authConfig).values({
      id: 1,
      passwordHash: 'scrypt$c2FsdA==$aGFzaA==',
      updatedAt: Date.now()
    })

    const response = await handler(new Request('http://localhost/api/profiles'))

    expect(response.status).toEqual(401)
    expect(await response.json()).toEqual({
      error: { message: 'Authentication required.' }
    })
  })

  it('leaves /api/auth/status reachable when a password is set', async () => {
    await db.insert(schema.authConfig).values({
      id: 1,
      passwordHash: 'scrypt$c2FsdA==$aGFzaA==',
      updatedAt: Date.now()
    })

    const response = await handler(
      new Request('http://localhost/api/auth/status')
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      authenticated: false,
      enabled: true
    })
  })
})

describe('decode-error remap', () => {
  it('answers 400 with the { error: { message } } wire shape for a missing query param', async () => {
    const response = await handler(new Request('http://localhost/api/search'))

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: {
        message:
          '{ readonly limit?: string | undefined; readonly q: string }\n└─ ["q"]\n   └─ is missing'
      }
    })
  })

  it('answers 400 with Invalid request body. for malformed JSON', async () => {
    const response = await handler(
      new Request('http://localhost/api/favorites', {
        body: 'not json',
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'POST'
      })
    )

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: { message: 'Invalid request body.' }
    })
  })
})

describe('stub groups', () => {
  it('answers 500 Not implemented yet. until Phase 4 lands', async () => {
    const response = await handler(
      new Request('http://localhost/api/library/movies')
    )

    expect(response.status).toEqual(500)
    expect(await response.json()).toEqual({
      error: { message: 'Not implemented yet.' }
    })
  })
})
