import { HttpApiBuilder } from '@effect/platform'
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { Effect } from 'effect'

import type { TelemetryDrizzleDatabase } from '../../telemetry/database'
import { TelemetryDatabase } from '../../telemetry/layer'
import { errors, spans } from '../../telemetry/schema'
import type { ErrorRow, NewErrorRow, NewSpanRow, SpanRow } from '../../telemetry/schema'
import { TelemetrySettings } from '../../telemetry/settings'
import { TelemetryWriter } from '../../telemetry/writer'
import { jukeboxApi } from '../contract'
import { NotFound } from '../contract/errors'
import type {
  TelemetryIngestRequest,
  TelemetryStats
} from '../contract/groups/telemetry'

import { internalTry, internalTryPromise } from './support'

// Frontend clocks can drift; drop spans/errors whose timestamps are more than an
// hour from the server clock rather than storing nonsense durations.
const maxClockSkew = 60 * 60 * 1000

function clampInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || value.trim() === '') {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return Math.min(Math.max(parsed, minimum), maximum)
}

function toWireSpan(row: SpanRow) {
  return {
    attributes: row.attributes,
    createdAt: row.createdAt,
    durationMs: row.durationMs,
    endTime: row.endTime,
    events: row.events,
    id: row.id,
    kind: row.kind,
    name: row.name,
    parentSpanId: row.parentSpanId,
    resource: row.resource,
    route: row.route,
    sessionId: row.sessionId,
    source: row.source,
    spanId: row.spanId,
    startTime: row.startTime,
    statusCode: row.statusCode,
    statusMessage: row.statusMessage,
    traceId: row.traceId
  }
}

function toWireError(row: ErrorRow) {
  return {
    attributes: row.attributes,
    createdAt: row.createdAt,
    id: row.id,
    kind: row.kind,
    message: row.message,
    name: row.name,
    source: row.source,
    spanId: row.spanId,
    stack: row.stack,
    timestamp: row.timestamp,
    traceId: row.traceId,
    url: row.url
  }
}

interface TraceAggregateRow {
  durationMs: number
  errorCount: number
  spanCount: number
  startTime: number
  traceId: string
}

interface RootSpanRow {
  kind: string
  name: string
  source: string
  startTime: number
  statusCode: string
  traceId: string
}

function listTraces(
  database: TelemetryDrizzleDatabase,
  options: {
    limit: number
    offset: number
    route: string | null
    status: string | null
  }
) {
  const routeCondition =
    options.route === null
      ? sql``
      : sql`where ${spans.traceId} in (select ${spans.traceId} from ${spans} where ${spans.route} = ${options.route})`

  const havingCondition =
    options.status === 'error'
      ? sql`having sum(case when ${spans.statusCode} = 'error' then 1 else 0 end) > 0`
      : sql``

  const aggregates = database.all<TraceAggregateRow>(sql`
    select
      ${spans.traceId} as traceId,
      min(${spans.startTime}) as startTime,
      max(${spans.endTime}) - min(${spans.startTime}) as durationMs,
      sum(case when ${spans.statusCode} = 'error' then 1 else 0 end) as errorCount,
      count(*) as spanCount
    from ${spans}
    ${routeCondition}
    group by ${spans.traceId}
    ${havingCondition}
    order by startTime desc
    limit ${options.limit} offset ${options.offset}
  `)

  const traceIds = aggregates.map((row) => row.traceId)

  if (traceIds.length === 0) {
    return []
  }

  const rootRows = database
    .select({
      kind: spans.kind,
      name: spans.name,
      source: spans.source,
      startTime: spans.startTime,
      statusCode: spans.statusCode,
      traceId: spans.traceId
    })
    .from(spans)
    .where(and(isNull(spans.parentSpanId), inArray(spans.traceId, traceIds)))
    .all()

  // A trace can have more than one parentless span (e.g. a frontend client span
  // and a backend span when propagation didn't link them). Prefer the frontend
  // root, then the earliest, so the summary shows the user-facing entry point.
  const rootByTrace = new Map<string, RootSpanRow>()

  for (const root of rootRows) {
    const existing = rootByTrace.get(root.traceId)

    if (existing === undefined) {
      rootByTrace.set(root.traceId, root)

      continue
    }

    if (existing.source !== 'frontend' && root.source === 'frontend') {
      rootByTrace.set(root.traceId, root)

      continue
    }

    if (existing.source === root.source && root.startTime < existing.startTime) {
      rootByTrace.set(root.traceId, root)
    }
  }

  return aggregates.map((row) => {
    const root = rootByTrace.get(row.traceId) ?? null

    return {
      durationMs: row.durationMs,
      errorCount: row.errorCount,
      rootKind: root?.kind ?? null,
      rootName: root?.name ?? null,
      source: root?.source ?? null,
      spanCount: row.spanCount,
      startTime: row.startTime,
      statusCode: root?.statusCode ?? null,
      traceId: row.traceId
    }
  })
}

function percentile(sortedAscending: number[], fraction: number): number {
  if (sortedAscending.length === 0) {
    return 0
  }

  const index = Math.ceil(fraction * sortedAscending.length) - 1
  const clamped = Math.min(Math.max(index, 0), sortedAscending.length - 1)

  return sortedAscending[clamped] ?? 0
}

function computeStats(
  database: TelemetryDrizzleDatabase,
  windowMinutes: number
): typeof TelemetryStats.Type {
  const cutoff = Date.now() - windowMinutes * 60 * 1000

  const serverSpans = database
    .select({
      durationMs: spans.durationMs,
      route: spans.route,
      statusCode: spans.statusCode
    })
    .from(spans)
    .where(and(eq(spans.kind, 'server'), gte(spans.createdAt, cutoff)))
    .all()

  const byRoute = new Map<
    string,
    { durations: number[]; errorCount: number }
  >()

  let errorCount = 0

  for (const span of serverSpans) {
    if (span.statusCode === 'error') {
      errorCount += 1
    }

    const key = span.route ?? '(unknown)'
    const bucket = byRoute.get(key) ?? { durations: [], errorCount: 0 }

    bucket.durations.push(span.durationMs)

    if (span.statusCode === 'error') {
      bucket.errorCount += 1
    }

    byRoute.set(key, bucket)
  }

  const routes = Array.from(byRoute.entries())
    .map(([route, bucket]) => {
      const sorted = [...bucket.durations].sort((first, second) => first - second)
      const total = sorted.reduce((sum, value) => sum + value, 0)

      return {
        averageMs: sorted.length === 0 ? 0 : total / sorted.length,
        count: sorted.length,
        errorCount: bucket.errorCount,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        route: route === '(unknown)' ? null : route
      }
    })
    .sort((first, second) => second.count - first.count)

  const totalRequests = serverSpans.length

  return {
    errorCount,
    errorRate: totalRequests === 0 ? 0 : errorCount / totalRequests,
    routes,
    totalRequests,
    windowMinutes
  }
}

function mapIngestSpans(
  request: TelemetryIngestRequest,
  now: number
): NewSpanRow[] {
  const resource = JSON.stringify(request.resource ?? {})

  return request.spans
    .filter((span) => Math.abs(span.startTime - now) <= maxClockSkew)
    .map((span) => {
      const startTime = span.startTime
      const endTime = Math.max(span.endTime, span.startTime)
      const attributes = span.attributes ?? {}
      const route =
        typeof attributes['http.route'] === 'string'
          ? attributes['http.route']
          : null

      return {
        attributes: JSON.stringify(attributes),
        createdAt: now,
        durationMs: endTime - startTime,
        endTime,
        events: JSON.stringify(span.events ?? []),
        kind: span.kind ?? 'client',
        name: span.name,
        parentSpanId: span.parentSpanId ?? null,
        resource,
        route,
        sessionId: request.sessionId ?? null,
        source: 'frontend',
        spanId: span.spanId,
        startTime,
        statusCode: span.statusCode ?? 'unset',
        statusMessage: span.statusMessage ?? null,
        traceId: span.traceId
      }
    })
}

function mapIngestErrors(
  request: TelemetryIngestRequest,
  now: number
): NewErrorRow[] {
  return request.errors
    .filter((error) => Math.abs(error.timestamp - now) <= maxClockSkew)
    .map((error) => ({
      attributes: '{}',
      createdAt: now,
      kind: error.kind,
      message: error.message,
      name: error.name,
      source: 'frontend',
      spanId: error.spanId ?? null,
      stack: error.stack ?? null,
      timestamp: error.timestamp,
      traceId: error.traceId ?? null,
      url: error.url ?? null
    }))
}

// The telemetry endpoints deliberately use plain `withInternalFallback` (never
// `withHandlerSpan`): recording or reading telemetry must not itself produce
// telemetry spans.
export const telemetryHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'telemetry',
  (handlers) =>
    handlers
      .handle('ingest', ({ payload }) =>
        Effect.gen(function* () {
          const writer = yield* TelemetryWriter
          const now = Date.now()
          const spanRows = mapIngestSpans(payload, now)
          const errorRows = mapIngestErrors(payload, now)

          writer.ingest(spanRows, errorRows)

          return { accepted: spanRows.length + errorRows.length }
        })
      )
      .handle('clear', () =>
        Effect.gen(function* () {
          const database = yield* TelemetryDatabase

          yield* internalTry(() => {
            database.delete(spans).run()
            database.delete(errors).run()
          })

          return { success: true as const }
        })
      )
      .handle('listTraces', ({ urlParams }) =>
        Effect.gen(function* () {
          const database = yield* TelemetryDatabase
          const limit = clampInteger(urlParams.limit, 50, 1, 200)
          const offset = clampInteger(urlParams.offset, 0, 0, 1_000_000)
          const route = urlParams.route ?? null
          const status = urlParams.status ?? null

          return yield* internalTry(() =>
            listTraces(database, { limit, offset, route, status })
          )
        })
      )
      .handle('getTrace', ({ path }) =>
        Effect.gen(function* () {
          const database = yield* TelemetryDatabase

          const rows = yield* internalTry(() =>
            database
              .select()
              .from(spans)
              .where(eq(spans.traceId, path.traceId))
              .orderBy(spans.startTime)
              .all()
          )

          if (rows.length === 0) {
            return yield* Effect.fail(
              new NotFound({
                message: `No trace found with id ${path.traceId}.`
              })
            )
          }

          return { spans: rows.map(toWireSpan), traceId: path.traceId }
        })
      )
      .handle('listErrors', ({ urlParams }) =>
        Effect.gen(function* () {
          const database = yield* TelemetryDatabase
          const limit = clampInteger(urlParams.limit, 100, 1, 500)
          const source = urlParams.source ?? null

          const rows = yield* internalTry(() => {
            const query = database
              .select()
              .from(errors)
              .orderBy(desc(errors.timestamp))
              .limit(limit)

            if (source !== null) {
              return query.where(eq(errors.source, source)).all()
            }

            return query.all()
          })

          return rows.map(toWireError)
        })
      )
      .handle('getStats', ({ urlParams }) =>
        Effect.gen(function* () {
          const database = yield* TelemetryDatabase
          const windowMinutes = clampInteger(
            urlParams.windowMinutes,
            60,
            1,
            10_080
          )

          return yield* internalTry(() => computeStats(database, windowMinutes))
        })
      )
      .handle('getConfig', () =>
        Effect.gen(function* () {
          const settings = yield* TelemetrySettings

          return yield* settings.current
        })
      )
      .handle('updateConfig', ({ payload }) =>
        Effect.gen(function* () {
          const settings = yield* TelemetrySettings

          return yield* settings.update(payload)
        })
      )
)
