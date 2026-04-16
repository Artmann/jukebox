// @vitest-environment node
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { Hono } from 'hono'
import { beforeEach, afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDb = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

vi.mock('../../config', () => ({
  getConfig: vi.fn().mockReturnValue(null),
  saveConfig: vi.fn().mockResolvedValue(undefined)
}))

const { settingsRoutes } = await import('./settings')
const { getSetting, setSetting, tmdbApiKeySettingKey, scanScheduleSettingKey } =
  await import('../../services/settings')

function buildApp(): Hono {
  const app = new Hono()
  app.route('/', settingsRoutes)
  return app
}

async function reset() {
  await testDb.db.delete(testDb.schema.settings)
  await testDb.db.delete(testDb.schema.episodes)
  await testDb.db.delete(testDb.schema.seasons)
  await testDb.db.delete(testDb.schema.shows)
  await testDb.db.delete(testDb.schema.movies)
  await testDb.db.delete(testDb.schema.libraries)
}

// Use the real fetch() only for tmdb verification. Stub globally with a
// controllable vi.fn() so tests can assert on calls.
const originalFetch = globalThis.fetch
let fetchMock: ReturnType<typeof vi.fn>

beforeAll(() => {
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

beforeEach(async () => {
  await reset()
  fetchMock.mockReset()
})

describe('GET /tmdb-key', () => {
  it('reports not configured when no key is set', async () => {
    const app = buildApp()
    const response = await app.request('/tmdb-key')
    const body = (await response.json()) as {
      configured: boolean
      apiKey: string
    }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ configured: false, apiKey: '' })
  })

  it('returns the stored key', async () => {
    await setSetting(tmdbApiKeySettingKey, 'stored-key', testDb.db)

    const app = buildApp()
    const response = await app.request('/tmdb-key')
    const body = (await response.json()) as {
      configured: boolean
      apiKey: string
    }

    expect(body).toEqual({ configured: true, apiKey: 'stored-key' })
  })
})

describe('PUT /tmdb-key', () => {
  it('rejects an empty key', async () => {
    const app = buildApp()
    const response = await app.request('/tmdb-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: '  ' })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain('required')
  })

  it('surfaces an actionable message when TMDB rejects the key', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 401 }) as unknown as Response
    )

    const app = buildApp()
    const response = await app.request('/tmdb-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'bad-key' })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain('themoviedb.org')
    expect(await getSetting(tmdbApiKeySettingKey, testDb.db)).toEqual(null)
  })

  it('persists a valid key', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200 }) as unknown as Response
    )

    const app = buildApp()
    const response = await app.request('/tmdb-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'good-key' })
    })
    const body = (await response.json()) as { configured: boolean }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ configured: true })
    expect(await getSetting(tmdbApiKeySettingKey, testDb.db)).toEqual(
      'good-key'
    )
  })
})

describe('GET /libraries', () => {
  it('returns an empty list by default', async () => {
    const app = buildApp()
    const response = await app.request('/libraries')
    const body = (await response.json()) as unknown[]

    expect(response.status).toEqual(200)
    expect(body).toEqual([])
  })

  it('returns existing libraries', async () => {
    await testDb.db.insert(testDb.schema.libraries).values({
      name: 'Movies',
      path: '/media/movies',
      type: 'movies',
      createdAt: new Date()
    })

    const app = buildApp()
    const response = await app.request('/libraries')
    const body = (await response.json()) as Array<{
      id: number
      name: string
      path: string
      type: string
    }>

    expect(response.status).toEqual(200)
    expect(body).toHaveLength(1)
    expect(body[0]).toEqual({
      id: expect.any(Number) as number,
      name: 'Movies',
      path: '/media/movies',
      type: 'movies'
    })
  })
})

describe('POST /libraries', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jukebox-settings-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('rejects a non-existent path', async () => {
    const app = buildApp()
    const response = await app.request('/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Movies',
        path: '/nope/does/not/exist',
        type: 'movies'
      })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain("doesn't exist")
  })

  it('rejects an invalid type', async () => {
    const app = buildApp()
    const response = await app.request('/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Movies',
        path: tempDir,
        type: 'music'
      })
    })

    expect(response.status).toEqual(400)
  })

  it('creates a library when the path is readable', async () => {
    const app = buildApp()
    const response = await app.request('/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Movies',
        path: tempDir,
        type: 'movies'
      })
    })
    const body = (await response.json()) as {
      id: number
      name: string
      path: string
      type: string
    }

    expect(response.status).toEqual(201)
    expect(body).toEqual({
      id: expect.any(Number) as number,
      name: 'Movies',
      path: tempDir,
      type: 'movies'
    })
  })

  it('rejects duplicate paths', async () => {
    const app = buildApp()
    await app.request('/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Movies', path: tempDir, type: 'movies' })
    })

    const response = await app.request('/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Again', path: tempDir, type: 'movies' })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain('already exists')
  })
})

describe('DELETE /libraries/:id', () => {
  it('returns 404 when the library is missing', async () => {
    const app = buildApp()
    const response = await app.request('/libraries/999', { method: 'DELETE' })

    expect(response.status).toEqual(404)
  })

  it('removes an empty library', async () => {
    const [created] = await testDb.db
      .insert(testDb.schema.libraries)
      .values({
        name: 'Movies',
        path: '/media/movies',
        type: 'movies',
        createdAt: new Date()
      })
      .returning()

    expect(created).toBeDefined()

    const app = buildApp()
    const response = await app.request(`/libraries/${created?.id ?? 0}`, {
      method: 'DELETE'
    })
    const body = (await response.json()) as { success: boolean }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ success: true })
  })

  it('refuses to remove a library that still has movies unless forced', async () => {
    const [library] = await testDb.db
      .insert(testDb.schema.libraries)
      .values({
        name: 'Movies',
        path: '/media/movies',
        type: 'movies',
        createdAt: new Date()
      })
      .returning()

    await testDb.db.insert(testDb.schema.movies).values({
      title: 'Test',
      filePath: '/media/movies/test.mp4',
      fileName: 'test.mp4',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const app = buildApp()
    const response = await app.request(`/libraries/${library?.id ?? 0}`, {
      method: 'DELETE'
    })
    const body = (await response.json()) as {
      error: { message: string; referenceCount: number }
    }

    expect(response.status).toEqual(409)
    expect(body.error.referenceCount).toEqual(1)
    expect(body.error.message).toContain("Force remove")
  })

  it('force-removes library and cascades movies', async () => {
    const [library] = await testDb.db
      .insert(testDb.schema.libraries)
      .values({
        name: 'Movies',
        path: '/media/movies',
        type: 'movies',
        createdAt: new Date()
      })
      .returning()

    await testDb.db.insert(testDb.schema.movies).values({
      title: 'Test',
      filePath: '/media/movies/test.mp4',
      fileName: 'test.mp4',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const app = buildApp()
    const response = await app.request(
      `/libraries/${library?.id ?? 0}?force=true`,
      { method: 'DELETE' }
    )

    expect(response.status).toEqual(200)

    const remainingMovies = await testDb.db.select().from(testDb.schema.movies)
    expect(remainingMovies).toEqual([])
  })
})

describe('GET / PUT /scan-schedule', () => {
  it('defaults to off when nothing is set', async () => {
    const app = buildApp()
    const response = await app.request('/scan-schedule')
    const body = (await response.json()) as { schedule: string }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ schedule: 'off' })
  })

  it('round-trips a valid value', async () => {
    const app = buildApp()
    const putResponse = await app.request('/scan-schedule', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedule: '6h' })
    })

    expect(putResponse.status).toEqual(200)

    const getResponse = await app.request('/scan-schedule')
    const body = (await getResponse.json()) as { schedule: string }

    expect(body).toEqual({ schedule: '6h' })
    expect(await getSetting(scanScheduleSettingKey, testDb.db)).toEqual('6h')
  })

  it('rejects unknown values', async () => {
    const app = buildApp()
    const response = await app.request('/scan-schedule', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedule: 'hourly' })
    })

    expect(response.status).toEqual(400)
  })
})

describe('generic GET / PUT /:key', () => {
  it('returns null for unknown keys', async () => {
    const app = buildApp()
    const response = await app.request('/unknown-key')
    const body = (await response.json()) as { value: string | null }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ value: null })
  })

  it('persists arbitrary string values', async () => {
    const app = buildApp()
    const putResponse = await app.request('/custom', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'hello' })
    })

    expect(putResponse.status).toEqual(200)

    const getResponse = await app.request('/custom')
    const body = (await getResponse.json()) as { value: string | null }

    expect(body).toEqual({ value: 'hello' })
  })

  it('rejects non-string values', async () => {
    const app = buildApp()
    const response = await app.request('/custom', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 42 })
    })

    expect(response.status).toEqual(400)
  })
})
