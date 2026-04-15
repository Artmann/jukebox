// @vitest-environment node
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDb = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

import type { ProfileContext } from './profile'

const { profileMiddleware } = await import('./profile')

interface ProbeBody {
  profileId: number
}

function buildApp(): Hono<ProfileContext> {
  const app = new Hono<ProfileContext>()
  app.use('*', profileMiddleware)
  app.get('/probe', (context) =>
    context.json({ profileId: context.get('profileId') })
  )
  return app
}

beforeEach(async () => {
  await testDb.db.delete(testDb.schema.favorites)
  await testDb.db.delete(testDb.schema.watchProgress)
  await testDb.db.delete(testDb.schema.profiles)
})

describe('profile middleware', () => {
  it('bootstraps a Default profile when none exists', async () => {
    const app = buildApp()
    const response = await app.request('/probe')
    const body = (await response.json()) as ProbeBody

    expect(body.profileId).toBeGreaterThan(0)
    expect(response.headers.get('set-cookie')).toContain('jukebox_profile_id=')

    const profiles = await testDb.db.select().from(testDb.schema.profiles)

    expect(profiles.map(({ name, emoji }) => ({ name, emoji }))).toEqual([
      { name: 'Default', emoji: '🍿' }
    ])
  })

  it('honors the cookie when the profile exists', async () => {
    await testDb.db.insert(testDb.schema.profiles).values([
      { id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) },
      { id: 2, name: 'Ada', emoji: '🚀', createdAt: new Date(1000) }
    ])

    const app = buildApp()
    const response = await app.request('/probe', {
      headers: { cookie: 'jukebox_profile_id=2' }
    })
    const body = (await response.json()) as ProbeBody

    expect(body).toEqual({ profileId: 2 })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('falls back to the most recent profile when cookie is stale', async () => {
    await testDb.db.insert(testDb.schema.profiles).values([
      { id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) },
      { id: 2, name: 'Ada', emoji: '🚀', createdAt: new Date(1000) }
    ])

    const app = buildApp()
    const response = await app.request('/probe', {
      headers: { cookie: 'jukebox_profile_id=999' }
    })
    const body = (await response.json()) as ProbeBody

    expect(body).toEqual({ profileId: 2 })
    expect(response.headers.get('set-cookie')).toContain('jukebox_profile_id=2')
  })
})
