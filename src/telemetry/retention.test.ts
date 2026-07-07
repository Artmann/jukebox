// @vitest-environment node
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { spans } from './schema'
import type { NewSpanRow } from './schema'
import { createTelemetryTestDatabase } from './test-database'

const millisecondsPerDay = 24 * 60 * 60 * 1000

// Retention runs inside a scoped Effect service that also forks a timer; the
// deletion SQL it uses is what matters, so this test exercises that SQL directly
// against an in-memory telemetry database rather than booting the service.
function purge(
  database: ReturnType<typeof createTelemetryTestDatabase>['db'],
  now: number,
  retentionDays: number,
  maxTraces: number
): void {
  const cutoff = now - retentionDays * millisecondsPerDay

  database.run(sql`delete from spans where created_at < ${cutoff}`)
  database.run(
    sql`delete from spans where trace_id not in (select trace_id from spans group by trace_id order by max(created_at) desc limit ${maxTraces})`
  )
}

function makeSpan(traceId: string, createdAt: number): NewSpanRow {
  return {
    attributes: '{}',
    createdAt,
    durationMs: 1,
    endTime: createdAt,
    events: '[]',
    kind: 'server',
    name: 'GET /api/x',
    resource: '{}',
    source: 'backend',
    spanId: traceId.slice(0, 16),
    startTime: createdAt - 1,
    statusCode: 'ok',
    traceId
  }
}

function traceIdsIn(
  database: ReturnType<typeof createTelemetryTestDatabase>['db']
): string[] {
  return database
    .select({ traceId: spans.traceId })
    .from(spans)
    .all()
    .map((row) => row.traceId)
    .sort()
}

describe('telemetry retention', () => {
  it('drops spans older than the retention window', () => {
    const database = createTelemetryTestDatabase().db
    const now = 30 * millisecondsPerDay

    database
      .insert(spans)
      .values([
        makeSpan('a'.repeat(32), now - 8 * millisecondsPerDay),
        makeSpan('b'.repeat(32), now - 1 * millisecondsPerDay)
      ])
      .run()

    purge(database, now, 7, 5_000)

    expect(traceIdsIn(database)).toEqual(['b'.repeat(32)])
  })

  it('trims to the newest N traces by recency', () => {
    const database = createTelemetryTestDatabase().db
    const now = 30 * millisecondsPerDay

    database
      .insert(spans)
      .values([
        makeSpan('a'.repeat(32), now - 3_000),
        makeSpan('b'.repeat(32), now - 2_000),
        makeSpan('c'.repeat(32), now - 1_000)
      ])
      .run()

    purge(database, now, 7, 2)

    // Keeps the two most recent traces (b and c), drops the oldest (a).
    expect(traceIdsIn(database)).toEqual(['b'.repeat(32), 'c'.repeat(32)])
  })
})
