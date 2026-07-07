// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'

import { createTelemetryTestDatabase } from './test-database'

const testDatabase = createTelemetryTestDatabase()

describe('telemetry test database', () => {
  beforeEach(() => {
    testDatabase.db.delete(testDatabase.schema.spans).run()
    testDatabase.db.delete(testDatabase.schema.errors).run()
  })

  it('migrates and round-trips a span row', () => {
    testDatabase.db
      .insert(testDatabase.schema.spans)
      .values({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        parentSpanId: null,
        name: 'GET /api/search',
        kind: 'server',
        source: 'backend',
        route: '/api/search',
        startTime: 1_000,
        endTime: 1_042,
        durationMs: 42,
        statusCode: 'ok',
        statusMessage: null,
        attributes: '{"http.method":"GET"}',
        events: '[]',
        resource: '{"service.name":"jukebox"}',
        sessionId: null,
        createdAt: 1_042
      })
      .run()

    const rows = testDatabase.db.select().from(testDatabase.schema.spans).all()

    expect(rows).toEqual([
      {
        id: rows[0]?.id,
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        parentSpanId: null,
        name: 'GET /api/search',
        kind: 'server',
        source: 'backend',
        route: '/api/search',
        startTime: 1_000,
        endTime: 1_042,
        durationMs: 42,
        statusCode: 'ok',
        statusMessage: null,
        attributes: '{"http.method":"GET"}',
        events: '[]',
        resource: '{"service.name":"jukebox"}',
        sessionId: null,
        createdAt: 1_042
      }
    ])
  })

  it('applies column defaults for a minimal error row', () => {
    testDatabase.db
      .insert(testDatabase.schema.errors)
      .values({
        source: 'frontend',
        kind: 'unhandledrejection',
        name: 'TypeError',
        message: 'Cannot read properties of undefined',
        timestamp: 2_000,
        createdAt: 2_000
      })
      .run()

    const rows = testDatabase.db.select().from(testDatabase.schema.errors).all()

    expect(rows).toEqual([
      {
        id: rows[0]?.id,
        traceId: null,
        spanId: null,
        source: 'frontend',
        kind: 'unhandledrejection',
        name: 'TypeError',
        message: 'Cannot read properties of undefined',
        stack: null,
        url: null,
        attributes: '{}',
        timestamp: 2_000,
        createdAt: 2_000
      }
    ])
  })
})
