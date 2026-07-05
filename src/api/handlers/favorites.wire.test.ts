// @vitest-environment node

// Wire tests for the favorites group, ported from the Hono route tests in
// src/api/routes/favorites.test.ts. The add-and-list round trip is covered by
// handlers.test.ts ('favorites group') and is not repeated here.
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
const otherProfileCookie = 'jukebox_profile_id=2'

function getStatus(query: string, cookie: string) {
  return handler(
    new Request(`http://localhost/api/favorites/status?${query}`, {
      headers: { cookie }
    })
  )
}

function send(method: string, payload: unknown, cookie: string) {
  return handler(
    new Request('http://localhost/api/favorites', {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', cookie },
      method
    })
  )
}

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  await db.delete(schema.favorites)
  await db.delete(schema.watchProgress)
  await db.delete(schema.movies)
  await db.delete(schema.profiles)

  await db.insert(schema.profiles).values([
    { id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) },
    { id: 2, name: 'Ada', emoji: '🚀', createdAt: new Date(1000) }
  ])

  await db.insert(schema.movies).values({
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
    const response = await getStatus('movieId=10', profileCookie)
    const body = (await response.json()) as { favorite: boolean }

    expect(body).toEqual({ favorite: false })
  })

  it('keeps favorites scoped per profile', async () => {
    await send('POST', { movieId: 10 }, profileCookie)

    const otherStatus = await getStatus('movieId=10', otherProfileCookie)
    const otherBody = (await otherStatus.json()) as { favorite: boolean }

    expect(otherBody).toEqual({ favorite: false })
  })

  it('removes a favorite', async () => {
    await send('POST', { movieId: 10 }, profileCookie)

    const remove = await send('DELETE', { movieId: 10 }, profileCookie)

    expect(remove.status).toEqual(200)

    const status = await getStatus('movieId=10', profileCookie)
    const body = (await status.json()) as { favorite: boolean }

    expect(body).toEqual({ favorite: false })
  })

  it('rejects body with both movieId and showId', async () => {
    const response = await send(
      'POST',
      { movieId: 10, showId: 1 },
      profileCookie
    )

    expect(response.status).toEqual(400)
  })

  it('add is idempotent', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await send('POST', { movieId: 10 }, profileCookie)

      expect(response.status).toEqual(200)
    }

    const list = await handler(
      new Request('http://localhost/api/favorites', {
        headers: { cookie: profileCookie }
      })
    )
    const body = (await list.json()) as unknown[]

    expect(body.length).toEqual(1)
  })
})
