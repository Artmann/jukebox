// @vitest-environment node
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

import { databaseTestLayer } from '../database/layer'
import { createTestDatabase } from '../database/test-database'

import { TelemetryDatabase, telemetryDatabaseTestLayer } from './layer'
import { errors, spans } from './schema'
import { TelemetrySettings } from './settings'
import { makeSqliteTracer } from './tracer'
import { createTelemetryTestDatabase } from './test-database'
import { TelemetryWriter } from './writer'

const traceIdPattern = /^[0-9a-f]{32}$/
const spanIdPattern = /^[0-9a-f]{16}$/

// Sets the SQLite tracer and keeps the writer/settings/databases alive for the
// duration of the program, exactly like src/index.ts wires them in production.
function buildAppLayer(
  mainDatabase: ReturnType<typeof createTestDatabase>['db'],
  telemetryDatabase: ReturnType<typeof createTelemetryTestDatabase>['db']
) {
  const tracerLive = Layer.unwrapEffect(
    Effect.map(TelemetryWriter, (writer) =>
      Layer.setTracer(makeSqliteTracer(writer.enqueue))
    )
  )

  return tracerLive.pipe(
    Layer.provideMerge(TelemetryWriter.Default),
    Layer.provide(TelemetrySettings.Default),
    Layer.provide(telemetryDatabaseTestLayer(telemetryDatabase)),
    Layer.provide(databaseTestLayer(mainDatabase))
  )
}

describe('makeSqliteTracer', () => {
  it('persists a successful span and a failed span, deriving an error row', async () => {
    const mainDatabase = createTestDatabase()
    const telemetryDatabase = createTelemetryTestDatabase()

    const program = Effect.gen(function* () {
      yield* Effect.succeed(1).pipe(
        Effect.withSpan('GET /api/search', {
          attributes: { 'http.method': 'GET', 'http.route': '/api/search' },
          kind: 'server'
        })
      )

      yield* Effect.fail(new Error('database is offline')).pipe(
        Effect.withSpan('handler search', { kind: 'internal' }),
        Effect.ignore
      )

      // Let the writer's 1s flush fiber drain the buffer into SQLite.
      yield* Effect.sleep('1500 millis')
    })

    await Effect.runPromise(program.pipe(Effect.provide(buildAppLayer(mainDatabase.db, telemetryDatabase.db))))

    const spanRows = telemetryDatabase.db.select().from(spans).all()
    const errorRows = telemetryDatabase.db.select().from(errors).all()

    expect(spanRows).toHaveLength(2)

    const successSpan = spanRows.find((row) => row.name === 'GET /api/search')
    const failureSpan = spanRows.find((row) => row.name === 'handler search')

    expect(successSpan?.traceId).toMatch(traceIdPattern)
    expect(successSpan?.spanId).toMatch(spanIdPattern)
    expect(successSpan?.parentSpanId).toBeNull()
    expect(successSpan?.kind).toEqual('server')
    expect(successSpan?.source).toEqual('backend')
    expect(successSpan?.route).toEqual('/api/search')
    expect(successSpan?.statusCode).toEqual('ok')
    expect(successSpan?.durationMs).toBeGreaterThanOrEqual(0)

    expect(failureSpan?.statusCode).toEqual('error')
    expect(failureSpan?.statusMessage).toEqual('database is offline')

    expect(errorRows).toHaveLength(1)
    expect(errorRows[0]).toMatchObject({
      kind: 'exception',
      message: 'database is offline',
      name: 'Error',
      source: 'backend',
      spanId: failureSpan?.spanId,
      traceId: failureSpan?.traceId
    })
  })
})
