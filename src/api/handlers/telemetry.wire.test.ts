// @vitest-environment node
import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { Layer } from 'effect'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDatabase.db,
  schema: testDatabase.schema
}))

const { databaseTestLayer } = await import('../../database/layer')
const { apiLive, decodeErrorRemapLive, rawRoutesLive, scanServicesLive } =
  await import('../../http/app')
const { telemetryTestLayer } = await import('../../telemetry/test-layer')

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
    Layer.provide(telemetryTestLayer),
    Layer.provide(databaseTestLayer(testDatabase.db))
  )
)

afterAll(async () => {
  await dispose()
})

const traceId = 'a'.repeat(32)

async function post(path: string, body: unknown) {
  const response = await handler(
    new Request(`http://localhost${path}`, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
  )

  return { body: await response.json(), status: response.status }
}

async function get(path: string) {
  const response = await handler(new Request(`http://localhost${path}`))

  return { body: await response.json(), status: response.status }
}

// The writer flushes its buffer to SQLite once a second; wait past that before
// querying.
function waitForFlush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1_300))
}

describe('telemetry endpoints', () => {
  it('ingests frontend spans/errors and serves them back through the query API', async () => {
    const now = Date.now()

    const ingest = await post('/api/telemetry', {
      errors: [
        {
          kind: 'unhandledrejection',
          message: 'Boom',
          name: 'TypeError',
          timestamp: now
        }
      ],
      resource: { 'service.name': 'jukebox-web' },
      sessionId: 'test-session',
      spans: [
        {
          attributes: { 'http.route': '/api/search' },
          endTime: now + 40,
          kind: 'client',
          name: 'GET /api/search',
          spanId: 'b'.repeat(16),
          startTime: now,
          statusCode: 'ok',
          traceId
        },
        {
          endTime: now + 20,
          kind: 'internal',
          name: 'handler search',
          parentSpanId: 'b'.repeat(16),
          spanId: 'c'.repeat(16),
          startTime: now + 5,
          statusCode: 'error',
          statusMessage: 'database offline',
          traceId
        }
      ]
    })

    expect(ingest.status).toEqual(200)
    expect(ingest.body).toEqual({ accepted: 3 })

    await waitForFlush()

    const traces = (await get('/api/telemetry/traces')).body as Array<{
      errorCount: number
      rootName: string | null
      spanCount: number
      traceId: string
    }>

    expect(traces).toEqual([
      {
        durationMs: expect.any(Number),
        errorCount: 1,
        rootKind: 'client',
        rootName: 'GET /api/search',
        source: 'frontend',
        spanCount: 2,
        startTime: expect.any(Number),
        statusCode: 'ok',
        traceId
      }
    ])

    const detail = (await get(`/api/telemetry/traces/${traceId}`)).body as {
      spans: Array<{ name: string }>
      traceId: string
    }

    expect(detail.traceId).toEqual(traceId)
    expect(detail.spans.map((span) => span.name).sort()).toEqual([
      'GET /api/search',
      'handler search'
    ])

    const errors = (await get('/api/telemetry/errors')).body as Array<{
      message: string
      name: string
    }>

    // Two errors: the explicit unhandledrejection, plus the row derived from
    // the error-status span ('handler search' → 'database offline').
    expect(errors.map((error) => error.message).sort()).toEqual([
      'Boom',
      'database offline'
    ])

    const missing = await get(`/api/telemetry/traces/${'f'.repeat(32)}`)

    expect(missing.status).toEqual(404)
  })

  it('clears all telemetry', async () => {
    await waitForFlush()

    const cleared = await post('/api/telemetry', {
      errors: [],
      spans: []
    })

    expect(cleared.status).toEqual(200)

    const response = await handler(
      new Request('http://localhost/api/telemetry', { method: 'DELETE' })
    )

    expect(response.status).toEqual(200)

    const traces = (await get('/api/telemetry/traces')).body

    expect(traces).toEqual([])
  })
})
