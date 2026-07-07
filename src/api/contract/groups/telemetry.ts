import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { NotFoundWire } from '../errors'
import { SuccessResponse } from '../schemas'

// --- Ingestion input --------------------------------------------------------

const hexTraceId = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{32}$/))
const hexSpanId = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{16}$/))
const attributeMap = Schema.Record({ key: Schema.String, value: Schema.Unknown })
const spanKind = Schema.Literal(
  'client',
  'consumer',
  'internal',
  'producer',
  'server'
)
const statusCode = Schema.Literal('error', 'ok', 'unset')

const SpanEventInput = Schema.Struct({
  attributes: Schema.optional(attributeMap),
  name: Schema.String,
  time: Schema.Number
})

// A span recorded in the browser. Timestamps are epoch milliseconds.
export const FrontendSpanInput = Schema.Struct({
  attributes: Schema.optional(attributeMap),
  endTime: Schema.Number,
  events: Schema.optional(Schema.Array(SpanEventInput)),
  kind: Schema.optional(spanKind),
  name: Schema.String,
  parentSpanId: Schema.optional(hexSpanId),
  spanId: hexSpanId,
  startTime: Schema.Number,
  statusCode: Schema.optional(statusCode),
  statusMessage: Schema.optional(Schema.String),
  traceId: hexTraceId
})

// A runtime error captured in the browser. It may have no owning span.
export const FrontendErrorInput = Schema.Struct({
  kind: Schema.Literal('console', 'exception', 'http', 'unhandledrejection'),
  message: Schema.String,
  name: Schema.String,
  spanId: Schema.optional(hexSpanId),
  stack: Schema.optional(Schema.String),
  timestamp: Schema.Number,
  traceId: Schema.optional(hexTraceId),
  url: Schema.optional(Schema.String)
})

export const TelemetryIngestRequest = Schema.Struct({
  errors: Schema.Array(FrontendErrorInput).pipe(Schema.maxItems(100)),
  resource: Schema.optional(attributeMap),
  sessionId: Schema.optional(Schema.String),
  spans: Schema.Array(FrontendSpanInput).pipe(Schema.maxItems(200))
})

export type TelemetryIngestRequest = typeof TelemetryIngestRequest.Type

export const TelemetryIngestResult = Schema.Struct({
  accepted: Schema.Number
})

// --- Dashboard query output -------------------------------------------------
// attributes/events/resource stay JSON strings on the wire; the dashboard
// parses them, keeping the schema flat and the query cheap.

export const TelemetrySpan = Schema.Struct({
  attributes: Schema.String,
  createdAt: Schema.Number,
  durationMs: Schema.Number,
  endTime: Schema.Number,
  events: Schema.String,
  id: Schema.Number,
  kind: Schema.String,
  name: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  resource: Schema.String,
  route: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
  source: Schema.String,
  spanId: Schema.String,
  startTime: Schema.Number,
  statusCode: Schema.String,
  statusMessage: Schema.NullOr(Schema.String),
  traceId: Schema.String
})

export const TraceSummary = Schema.Struct({
  durationMs: Schema.Number,
  errorCount: Schema.Number,
  rootKind: Schema.NullOr(Schema.String),
  rootName: Schema.NullOr(Schema.String),
  source: Schema.NullOr(Schema.String),
  spanCount: Schema.Number,
  startTime: Schema.Number,
  statusCode: Schema.NullOr(Schema.String),
  traceId: Schema.String
})

export const TraceDetail = Schema.Struct({
  spans: Schema.Array(TelemetrySpan),
  traceId: Schema.String
})

export const TelemetryError = Schema.Struct({
  attributes: Schema.String,
  createdAt: Schema.Number,
  id: Schema.Number,
  kind: Schema.String,
  message: Schema.String,
  name: Schema.String,
  source: Schema.String,
  spanId: Schema.NullOr(Schema.String),
  stack: Schema.NullOr(Schema.String),
  timestamp: Schema.Number,
  traceId: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String)
})

export const RouteLatency = Schema.Struct({
  averageMs: Schema.Number,
  count: Schema.Number,
  errorCount: Schema.Number,
  p50: Schema.Number,
  p95: Schema.Number,
  route: Schema.NullOr(Schema.String)
})

export const TelemetryStats = Schema.Struct({
  errorCount: Schema.Number,
  errorRate: Schema.Number,
  routes: Schema.Array(RouteLatency),
  totalRequests: Schema.Number,
  windowMinutes: Schema.Number
})

export type RouteLatency = typeof RouteLatency.Type
export type TelemetryError = typeof TelemetryError.Type
export type TelemetrySpan = typeof TelemetrySpan.Type
export type TelemetryStats = typeof TelemetryStats.Type
export type TraceDetail = typeof TraceDetail.Type
export type TraceSummary = typeof TraceSummary.Type

// --- Config -----------------------------------------------------------------

export const TelemetryConfigResponse = Schema.Struct({
  maxTraces: Schema.Number,
  retentionDays: Schema.Number
})

export const TelemetryConfigInput = Schema.Struct({
  maxTraces: Schema.optional(Schema.Number),
  retentionDays: Schema.optional(Schema.Number)
})

export type TelemetryConfigInput = typeof TelemetryConfigInput.Type
export type TelemetryConfigResponse = typeof TelemetryConfigResponse.Type

// --- Query params -----------------------------------------------------------

const TracesQuery = Schema.Struct({
  limit: Schema.optional(Schema.String),
  offset: Schema.optional(Schema.String),
  route: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String)
})

const ErrorsQuery = Schema.Struct({
  limit: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String)
})

const StatsQuery = Schema.Struct({
  windowMinutes: Schema.optional(Schema.String)
})

const traceIdParam = HttpApiSchema.param('traceId', Schema.String)

// The whole telemetry surface is intentionally unauthenticated: the ingest
// endpoint must accept frontend errors before login/setup, and the dashboard is
// a local diagnostic screen already gated behind the app's auth on the client.
// None of these paths are traced (the request middleware skips /api/telemetry),
// which also prevents the dashboard from tracing itself.
export const telemetryGroup = HttpApiGroup.make('telemetry')
  .add(
    HttpApiEndpoint.post('ingest', '/telemetry')
      .setPayload(TelemetryIngestRequest)
      .addSuccess(TelemetryIngestResult)
  )
  .add(
    HttpApiEndpoint.del('clear', '/telemetry').addSuccess(SuccessResponse)
  )
  .add(
    HttpApiEndpoint.get('listTraces', '/telemetry/traces')
      .setUrlParams(TracesQuery)
      .addSuccess(Schema.Array(TraceSummary))
  )
  .add(
    HttpApiEndpoint.get('getTrace')`/telemetry/traces/${traceIdParam}`
      .addSuccess(TraceDetail)
      .addError(NotFoundWire)
  )
  .add(
    HttpApiEndpoint.get('listErrors', '/telemetry/errors')
      .setUrlParams(ErrorsQuery)
      .addSuccess(Schema.Array(TelemetryError))
  )
  .add(
    HttpApiEndpoint.get('getStats', '/telemetry/stats')
      .setUrlParams(StatsQuery)
      .addSuccess(TelemetryStats)
  )
  .add(
    HttpApiEndpoint.get('getConfig', '/telemetry/config').addSuccess(
      TelemetryConfigResponse
    )
  )
  .add(
    HttpApiEndpoint.patch('updateConfig', '/telemetry/config')
      .setPayload(TelemetryConfigInput)
      .addSuccess(TelemetryConfigResponse)
  )
