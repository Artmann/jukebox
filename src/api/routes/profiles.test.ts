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
const { profileRoutes } = await import('./profiles')

function buildApp(): Hono {
  const app = new Hono()
  app.use('*', profileMiddleware)
  app.route('/', profileRoutes)
  return app
}

async function reset() {
  await testDb.db.delete(testDb.schema.favorites)
  await testDb.db.delete(testDb.schema.watchProgress)
  await testDb.db.delete(testDb.schema.profiles)
}

beforeEach(async () => {
  await reset()
  await testDb.db.insert(testDb.schema.profiles).values({
    id: 1,
    name: 'Default',
    emoji: '🍿',
    createdAt: new Date(0)
  })
})

describe('profile routes', () => {
  it('lists profiles', async () => {
    const app = buildApp()
    const response = await app.request('/')
    const body = (await response.json()) as Array<{ name: string; emoji: string }>

    expect(response.status).toEqual(200)
    expect(body.map(({ name, emoji }) => ({ name, emoji }))).toEqual([
      { name: 'Default', emoji: '🍿' }
    ])
  })

  it('returns the active profile from cookie', async () => {
    const app = buildApp()
    const response = await app.request('/active', {
      headers: { cookie: 'jukebox_profile_id=1' }
    })
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
    const app = buildApp()
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', emoji: '🚀' })
    })
    const body = (await response.json()) as {
      id: number
      name: string
      emoji: string
    }

    expect(response.status).toEqual(201)
    expect(body.name).toEqual('Ada')
    expect(body.emoji).toEqual('🚀')
  })

  it('rejects duplicate name', async () => {
    const app = buildApp()
    await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', emoji: '🚀' })
    })
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', emoji: '🦊' })
    })

    expect(response.status).toEqual(400)
  })

  it('updates a profile', async () => {
    const app = buildApp()
    const response = await app.request('/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', emoji: '🎬' })
    })
    const body = (await response.json()) as { name: string; emoji: string }

    expect(response.status).toEqual(200)
    expect(body).toEqual({
      id: 1,
      name: 'Renamed',
      emoji: '🎬',
      createdAt: new Date(0).toISOString()
    })
  })

  it('refuses to delete the last profile', async () => {
    const app = buildApp()
    const response = await app.request('/1', { method: 'DELETE' })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body).toEqual({
      error: { message: 'Cannot delete the last remaining profile' }
    })
  })

  it('deletes a non-last profile', async () => {
    const app = buildApp()
    await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', emoji: '🚀' })
    })
    const created = await app.request('/')
    const profiles = (await created.json()) as Array<{ id: number; name: string }>
    const ada = profiles.find((profile) => profile.name === 'Ada')

    expect(ada).toBeDefined()

    const response = await app.request(`/${ada?.id ?? 0}`, { method: 'DELETE' })

    expect(response.status).toEqual(200)

    const after = await app.request('/')
    const remaining = (await after.json()) as Array<{ name: string }>

    expect(remaining.map((profile) => profile.name)).toEqual(['Default'])
  })

  it('activate sets the cookie', async () => {
    const app = buildApp()
    const response = await app.request('/1/activate', { method: 'POST' })

    expect(response.status).toEqual(200)
    expect(response.headers.get('set-cookie')).toContain('jukebox_profile_id=1')
  })
})
