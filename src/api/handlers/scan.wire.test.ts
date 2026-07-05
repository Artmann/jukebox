// @vitest-environment node

// Wire tests for the scan group's status serialization, ported from the Hono
// route tests in src/api/routes/scan.test.ts. The Hono tests mocked the scan
// manager; here the real scan manager reads persisted scan_jobs rows from the
// test database. The library list, idle status, no-libraries 400, and SSE
// stream cases live in handlers.test.ts. The started/already-running cases
// are not ported — they would launch a real filesystem scan.
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
const profileCookie = 'jukebox_profile_id=1'

function getStatus() {
  return handler(
    new Request('http://localhost/api/scan/status', {
      headers: { cookie: profileCookie }
    })
  )
}

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  await db.delete(schema.scanJobs)
  await db.delete(schema.libraries)
  await db.delete(schema.profiles)

  await db
    .insert(schema.profiles)
    .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })
})

describe('GET /status', () => {
  it('serializes timestamps as ISO strings', async () => {
    await db.insert(schema.scanJobs).values({
      added: 3,
      endedAt: new Date('2025-01-01T12:05:00Z'),
      errorMessage: null,
      id: 7,
      libraryResults: null,
      startedAt: new Date('2025-01-01T12:00:00Z'),
      status: 'done',
      total: 10,
      updated: 1
    })

    const response = await getStatus()
    const body = (await response.json()) as {
      currentJob: null
      isRunning: false
      lastJob: { endedAt: string | null; startedAt: string }
    }

    expect(response.status).toEqual(200)
    expect(body.lastJob).toEqual({
      added: 3,
      endedAt: '2025-01-01T12:05:00.000Z',
      errorMessage: null,
      id: 7,
      libraries: [],
      startedAt: '2025-01-01T12:00:00.000Z',
      status: 'done',
      total: 10,
      updated: 1
    })
  })

  it('parses per-library results from the job row', async () => {
    const libraryResult = {
      added: 2,
      error: null,
      libraryId: 1,
      name: 'Movies',
      status: 'complete',
      total: 3,
      updated: 1
    }

    await db.insert(schema.scanJobs).values({
      added: 2,
      endedAt: new Date('2025-01-01T12:05:00Z'),
      errorMessage: null,
      id: 8,
      libraryResults: JSON.stringify([libraryResult]),
      startedAt: new Date('2025-01-01T12:00:00Z'),
      status: 'done',
      total: 3,
      updated: 1
    })

    const response = await getStatus()
    const body = (await response.json()) as {
      lastJob: { libraries: unknown[] }
    }

    expect(response.status).toEqual(200)
    expect(body.lastJob.libraries).toEqual([libraryResult])
  })
})
