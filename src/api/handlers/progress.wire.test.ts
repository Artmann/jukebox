// @vitest-environment node

// Wire tests for the progress group's per-profile scoping, ported from the
// Hono route tests in src/api/routes/progress.test.ts. The zero-progress and
// save-and-read round-trip cases are covered by handlers.test.ts ('progress
// group') and are not repeated here.
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
const { apiLive, decodeErrorRemapLive, rawRoutesLive, scanServicesLive } =
  await import('../../http/app')

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
const profileOne = 'jukebox_profile_id=1'
const profileTwo = 'jukebox_profile_id=2'

function getProgress(path: string, cookie: string) {
  return handler(
    new Request(`http://localhost/api/progress${path}`, {
      headers: { cookie }
    })
  )
}

function putProgress(path: string, payload: unknown, cookie: string) {
  return handler(
    new Request(`http://localhost/api/progress${path}`, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', cookie },
      method: 'PUT'
    })
  )
}

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  await db.delete(schema.watchProgress)
  await db.delete(schema.movies)
  await db.delete(schema.profiles)

  await db.insert(schema.profiles).values([
    { id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) },
    { id: 2, name: 'Ada', emoji: '🚀', createdAt: new Date(1000) }
  ])

  await db.insert(schema.movies).values({
    id: 10,
    title: 'Dune',
    filePath: '/movies/dune.mp4',
    fileName: 'dune.mp4',
    createdAt: new Date(0),
    updatedAt: new Date(0)
  })
})

describe('progress routes', () => {
  it('keeps progress isolated between profiles', async () => {
    await putProgress('/10', { currentTime: 120, duration: 600 }, profileOne)

    const otherGet = await getProgress('/10', profileTwo)
    const otherBody = (await otherGet.json()) as {
      currentTime: number
      duration: number | null
    }

    expect(otherBody).toEqual({ currentTime: 0, duration: null })
  })

  it('continue-watching only includes the active profile rows', async () => {
    await putProgress('/10', { currentTime: 100, duration: 600 }, profileOne)
    await putProgress('/10', { currentTime: 50, duration: 600 }, profileTwo)

    const oneList = await getProgress('/continue-watching', profileOne)
    const oneBody = (await oneList.json()) as Array<{
      currentTime: number
      movie?: { id: number }
    }>

    expect(oneBody.length).toEqual(1)
    expect(oneBody[0]?.currentTime).toEqual(100)
  })
})
