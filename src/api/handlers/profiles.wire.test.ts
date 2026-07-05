// @vitest-environment node

// Wire tests for the profiles group, ported from the Hono route tests in
// src/api/routes/profiles.test.ts plus the stale-cookie fallback case from
// src/api/middleware/profile.test.ts (the bootstrap and valid-cookie cases
// live in handlers.test.ts under 'profile middleware').
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

function get(path: string, cookie: string = profileCookie) {
  return handler(
    new Request(`http://localhost/api/profiles${path}`, {
      headers: { cookie }
    })
  )
}

function send(path: string, method: string, payload?: unknown) {
  return handler(
    new Request(`http://localhost/api/profiles${path}`, {
      body: payload === undefined ? undefined : JSON.stringify(payload),
      headers: { 'content-type': 'application/json', cookie: profileCookie },
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
  await db.delete(schema.profiles)

  await db
    .insert(schema.profiles)
    .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })
})

describe('profile routes', () => {
  it('lists profiles', async () => {
    const response = await get('')
    const body = (await response.json()) as Array<{
      emoji: string
      name: string
    }>

    expect(response.status).toEqual(200)
    expect(body.map(({ name, emoji }) => ({ name, emoji }))).toEqual([
      { name: 'Default', emoji: '🍿' }
    ])
  })

  it('returns the active profile from cookie', async () => {
    const response = await get('/active')
    const body = (await response.json()) as { id: number; name: string }

    expect(response.status).toEqual(200)
    expect(body).toEqual({
      id: 1,
      name: 'Default',
      emoji: '🍿',
      createdAt: new Date(0).toISOString()
    })
  })

  it('creates a profile', async () => {
    const response = await send('', 'POST', { name: 'Ada', emoji: '🚀' })
    const body = (await response.json()) as {
      emoji: string
      id: number
      name: string
    }

    expect(response.status).toEqual(201)
    expect(body.name).toEqual('Ada')
    expect(body.emoji).toEqual('🚀')
  })

  it('rejects duplicate name', async () => {
    await send('', 'POST', { name: 'Ada', emoji: '🚀' })

    const response = await send('', 'POST', { name: 'Ada', emoji: '🦊' })

    expect(response.status).toEqual(400)
  })

  it('updates a profile', async () => {
    const response = await send('/1', 'PATCH', {
      name: 'Renamed',
      emoji: '🎬'
    })
    const body = (await response.json()) as { emoji: string; name: string }

    expect(response.status).toEqual(200)
    expect(body).toEqual({
      id: 1,
      name: 'Renamed',
      emoji: '🎬',
      createdAt: new Date(0).toISOString()
    })
  })

  it('refuses to delete the last profile', async () => {
    const response = await send('/1', 'DELETE')
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body).toEqual({
      error: { message: 'Cannot delete the last remaining profile' }
    })
  })

  it('deletes a non-last profile', async () => {
    await send('', 'POST', { name: 'Ada', emoji: '🚀' })

    const created = await get('')
    const profiles = (await created.json()) as Array<{
      id: number
      name: string
    }>
    const ada = profiles.find((profile) => profile.name === 'Ada')

    expect(ada).toBeDefined()

    const response = await send(`/${ada?.id ?? 0}`, 'DELETE')

    expect(response.status).toEqual(200)

    const after = await get('')
    const remaining = (await after.json()) as Array<{ name: string }>

    expect(remaining.map((profile) => profile.name)).toEqual(['Default'])
  })

  it('activate sets the cookie', async () => {
    const response = await send('/1/activate', 'POST')

    expect(response.status).toEqual(200)
    expect(response.headers.get('set-cookie')).toContain(
      'jukebox_profile_id=1'
    )
  })
})

describe('profile middleware fallback', () => {
  it('falls back to the most recent profile when cookie is stale', async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 2, name: 'Ada', emoji: '🚀', createdAt: new Date(1000) })

    const response = await get('/active', 'jukebox_profile_id=999')
    const body = (await response.json()) as { id: number }

    expect(response.status).toEqual(200)
    expect(body.id).toEqual(2)
    expect(response.headers.get('set-cookie')).toContain(
      'jukebox_profile_id=2'
    )
  })
})
