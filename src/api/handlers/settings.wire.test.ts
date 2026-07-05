// @vitest-environment node

// Wire tests for the settings group, ported from the Hono route tests in
// src/api/routes/settings.test.ts: library CRUD (including the 409
// LibraryInUse conflict and force delete), the scan-schedule routes with
// their scheduler side effects, and the generic settings key/value routes.
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path, { join } from 'path'

import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { Layer } from 'effect'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDatabase.db,
  schema: testDatabase.schema
}))

const { databaseTestLayer } = await import('../../database/layer')
const { apiLive, decodeErrorRemapLive, rawRoutesLive, scanServicesLive } =
  await import('../../http/app')
const { getSetting, scanScheduleSettingKey } = await import(
  '../../services/settings'
)

// The real Scheduler service (via scanServicesLive) reads and writes the test
// database, so the scan-schedule routes exercise the actual scheduler side
// effects. Assertions check the persisted schedule value, not the timer's
// future nextRunAt.
const { dispose, handler } = HttpApiBuilder.toWebHandler(
  Layer.mergeAll(
    apiLive,
    rawRoutesLive,
    decodeErrorRemapLive,
    NodeHttpServer.layerContext
  ).pipe(
    Layer.provide(
      scanServicesLive.pipe(Layer.provide(databaseTestLayer(testDatabase.db)))
    ),
    Layer.provide(databaseTestLayer(testDatabase.db))
  )
)

const { db, schema } = testDatabase
const profileCookie = 'jukebox_profile_id=1'

function get(requestPath: string) {
  return handler(
    new Request(`http://localhost/api/settings${requestPath}`, {
      headers: { cookie: profileCookie }
    })
  )
}

function send(requestPath: string, method: string, payload?: unknown) {
  return handler(
    new Request(`http://localhost/api/settings${requestPath}`, {
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
  await db.delete(schema.settings)
  await db.delete(schema.watchProgress)
  await db.delete(schema.favorites)
  await db.delete(schema.episodes)
  await db.delete(schema.seasons)
  await db.delete(schema.shows)
  await db.delete(schema.movies)
  await db.delete(schema.libraries)
  await db.delete(schema.profiles)

  await db
    .insert(schema.profiles)
    .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })
})

describe('GET /libraries', () => {
  it('returns an empty list by default', async () => {
    const response = await get('/libraries')
    const body = (await response.json()) as unknown[]

    expect(response.status).toEqual(200)
    expect(body).toEqual([])
  })

  it('returns existing libraries', async () => {
    await db.insert(schema.libraries).values({
      name: 'Movies',
      path: '/media/movies',
      type: 'movies',
      createdAt: new Date()
    })

    const response = await get('/libraries')
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
    const response = await send('/libraries', 'POST', {
      name: 'Movies',
      path: '/nope/does/not/exist',
      type: 'movies'
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain("doesn't exist")
  })

  it('rejects an invalid type', async () => {
    const response = await send('/libraries', 'POST', {
      name: 'Movies',
      path: tempDir,
      type: 'music'
    })

    expect(response.status).toEqual(400)
  })

  it('creates a library when the path is readable', async () => {
    const response = await send('/libraries', 'POST', {
      name: 'Movies',
      path: tempDir,
      type: 'movies'
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
    await send('/libraries', 'POST', {
      name: 'Movies',
      path: tempDir,
      type: 'movies'
    })

    const response = await send('/libraries', 'POST', {
      name: 'Again',
      path: tempDir,
      type: 'movies'
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain('already exists')
  })
})

describe('DELETE /libraries/:id', () => {
  it('returns 404 when the library is missing', async () => {
    const response = await send('/libraries/999', 'DELETE')

    expect(response.status).toEqual(404)
  })

  it('removes an empty library', async () => {
    const [created] = await db
      .insert(schema.libraries)
      .values({
        name: 'Movies',
        path: '/media/movies',
        type: 'movies',
        createdAt: new Date()
      })
      .returning()

    expect(created).toBeDefined()

    const response = await send(`/libraries/${created?.id ?? 0}`, 'DELETE')
    const body = (await response.json()) as { success: boolean }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ success: true })
  })

  it('refuses to remove a library that still has movies unless forced', async () => {
    const libraryPath = path.resolve('/media/movies')
    const moviePath = path.join(libraryPath, 'test.mp4')

    const [library] = await db
      .insert(schema.libraries)
      .values({
        name: 'Movies',
        path: libraryPath,
        type: 'movies',
        createdAt: new Date()
      })
      .returning()

    await db.insert(schema.movies).values({
      title: 'Test',
      filePath: moviePath,
      fileName: 'test.mp4',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const response = await send(`/libraries/${library?.id ?? 0}`, 'DELETE')
    const body = (await response.json()) as {
      error: { message: string; referenceCount: number }
    }

    expect(response.status).toEqual(409)
    expect(body.error.referenceCount).toEqual(1)
    expect(body.error.message).toContain('Force remove')
  })

  it('force-removes library and cascades movies plus watch progress', async () => {
    const libraryPath = path.resolve('/media/movies')
    const moviePath = path.join(libraryPath, 'test.mp4')
    const otherMoviePath = path.resolve('/other/elsewhere.mp4')

    const [library] = await db
      .insert(schema.libraries)
      .values({
        name: 'Movies',
        path: libraryPath,
        type: 'movies',
        createdAt: new Date()
      })
      .returning()

    const [insertedMovie] = await db
      .insert(schema.movies)
      .values({
        title: 'Test',
        filePath: moviePath,
        fileName: 'test.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    // Movie in a different library — must survive the cascade.
    const [unrelatedMovie] = await db
      .insert(schema.movies)
      .values({
        title: 'Other',
        filePath: otherMoviePath,
        fileName: 'elsewhere.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    await db.insert(schema.watchProgress).values({
      profileId: 1,
      movieId: insertedMovie?.id ?? 0,
      currentTime: 42,
      updatedAt: new Date()
    })

    const response = await send(
      `/libraries/${library?.id ?? 0}?force=true`,
      'DELETE'
    )

    expect(response.status).toEqual(200)

    const remainingMovies = await db.select().from(schema.movies)

    expect(remainingMovies.map((movie) => movie.id)).toEqual([
      unrelatedMovie?.id ?? -1
    ])

    const remainingProgress = await db.select().from(schema.watchProgress)

    expect(remainingProgress).toEqual([])
  })
})

describe('GET / PUT /scan-schedule', () => {
  it('defaults to off when nothing is set', async () => {
    const response = await get('/scan-schedule')
    const body = (await response.json()) as {
      nextRunAt: string | null
      schedule: string
    }

    expect(response.status).toEqual(200)
    expect(body.schedule).toEqual('off')
  })

  it('round-trips a valid value', async () => {
    const putResponse = await send('/scan-schedule', 'PUT', { schedule: '6h' })

    expect(putResponse.status).toEqual(200)

    const getResponse = await get('/scan-schedule')
    const body = (await getResponse.json()) as {
      nextRunAt: string | null
      schedule: string
    }

    expect(body.schedule).toEqual('6h')
    expect(await getSetting(scanScheduleSettingKey, db)).toEqual('6h')
  })

  it('rejects unknown values', async () => {
    const response = await send('/scan-schedule', 'PUT', {
      schedule: 'hourly'
    })

    expect(response.status).toEqual(400)
  })
})

describe('generic GET / PUT /:key', () => {
  it('returns null for unknown keys', async () => {
    const response = await get('/unknown-key')
    const body = (await response.json()) as { value: string | null }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ value: null })
  })

  it('persists arbitrary string values', async () => {
    const putResponse = await send('/custom', 'PUT', { value: 'hello' })

    expect(putResponse.status).toEqual(200)

    const getResponse = await get('/custom')
    const body = (await getResponse.json()) as { value: string | null }

    expect(body).toEqual({ value: 'hello' })
  })

  it('rejects non-string values', async () => {
    const response = await send('/custom', 'PUT', { value: 42 })

    expect(response.status).toEqual(400)
  })

  it('rejects reads on reserved keys and points at the specific route', async () => {
    const scheduleResponse = await get('/scanSchedule')
    const scheduleBody = (await scheduleResponse.json()) as {
      error: { message: string }
    }

    expect(scheduleResponse.status).toEqual(400)
    expect(scheduleBody.error.message).toContain('/api/settings/scan-schedule')
  })

  it('rejects writes on reserved keys so their validators cannot be bypassed', async () => {
    const scheduleResponse = await send('/scanSchedule', 'PUT', {
      value: 'garbage'
    })
    const scheduleBody = (await scheduleResponse.json()) as {
      error: { message: string }
    }

    expect(scheduleResponse.status).toEqual(400)
    expect(scheduleBody.error.message).toContain('/api/settings/scan-schedule')
    expect(await getSetting(scanScheduleSettingKey, db)).toEqual(null)
  })
})
