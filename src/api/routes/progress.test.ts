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
const { progressRoutes } = await import('./progress')

function buildApp(): Hono {
  const app = new Hono()
  app.use('*', profileMiddleware)
  app.route('/', progressRoutes)
  return app
}

const profileOne = 'jukebox_profile_id=1'
const profileTwo = 'jukebox_profile_id=2'

beforeEach(async () => {
  await testDb.db.delete(testDb.schema.watchProgress)
  await testDb.db.delete(testDb.schema.movies)
  await testDb.db.delete(testDb.schema.profiles)

  await testDb.db.insert(testDb.schema.profiles).values([
    { id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) },
    { id: 2, name: 'Ada', emoji: '🚀', createdAt: new Date(1000) }
  ])

  await testDb.db.insert(testDb.schema.movies).values({
    id: 10,
    title: 'Dune',
    filePath: '/movies/dune.mp4',
    fileName: 'dune.mp4',
    createdAt: new Date(0),
    updatedAt: new Date(0)
  })
})

describe('progress routes', () => {
  it('returns zero progress when none exists', async () => {
    const app = buildApp()
    const response = await app.request('/10', { headers: { cookie: profileOne } })
    const body = (await response.json()) as { currentTime: number; duration: number | null }

    expect(body).toEqual({ currentTime: 0, duration: null })
  })

  it('saves and reads movie progress for the active profile', async () => {
    const app = buildApp()

    await app.request('/10', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: profileOne },
      body: JSON.stringify({ currentTime: 120, duration: 600 })
    })

    const get = await app.request('/10', { headers: { cookie: profileOne } })
    const body = (await get.json()) as { currentTime: number; duration: number | null }

    expect(body).toEqual({ currentTime: 120, duration: 600 })
  })

  it('keeps progress isolated between profiles', async () => {
    const app = buildApp()

    await app.request('/10', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: profileOne },
      body: JSON.stringify({ currentTime: 120, duration: 600 })
    })

    const otherGet = await app.request('/10', {
      headers: { cookie: profileTwo }
    })
    const otherBody = (await otherGet.json()) as {
      currentTime: number
      duration: number | null
    }

    expect(otherBody).toEqual({ currentTime: 0, duration: null })
  })

  it('continue-watching only includes the active profile rows', async () => {
    const app = buildApp()

    await app.request('/10', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: profileOne },
      body: JSON.stringify({ currentTime: 100, duration: 600 })
    })
    await app.request('/10', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: profileTwo },
      body: JSON.stringify({ currentTime: 50, duration: 600 })
    })

    const oneList = await app.request('/continue-watching', {
      headers: { cookie: profileOne }
    })
    const oneBody = (await oneList.json()) as Array<{
      currentTime: number
      movie?: { id: number }
    }>

    expect(oneBody.length).toEqual(1)
    expect(oneBody[0]?.currentTime).toEqual(100)
  })
})
