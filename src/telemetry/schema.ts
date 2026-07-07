import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// One row per finished span. Shaped after the OpenTelemetry span model so the
// data reads the same as any OTel exporter would produce, but stored locally.
//
// Timestamps are epoch milliseconds stored as plain integers. Effect's tracer
// hands spans epoch nanoseconds as bigint; we divide down to millis before
// storing because a nanosecond epoch overflows the 2^53 safe-integer range that
// SQLite/JS numbers rely on. Sub-millisecond precision is preserved separately
// in `durationMs` (a real), computed from the full nanosecond difference.
export const spans = sqliteTable(
  'spans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // 32 hex characters, shared by every span in the same trace.
    traceId: text('trace_id').notNull(),
    // 16 hex characters, unique to this span.
    spanId: text('span_id').notNull(),
    // The span that caused this one; null for a trace's root span.
    parentSpanId: text('parent_span_id'),
    name: text('name').notNull(),
    // 'server' | 'client' | 'internal' | 'producer' | 'consumer'
    kind: text('kind').notNull().default('internal'),
    // 'backend' | 'frontend' — which side of the app recorded the span.
    source: text('source').notNull(),
    // Denormalized request route for server spans (e.g. '/api/search') so the
    // stats query can group by route without parsing attributes.
    route: text('route'),
    startTime: integer('start_time').notNull(),
    endTime: integer('end_time').notNull(),
    durationMs: real('duration_ms').notNull(),
    // 'unset' | 'ok' | 'error'
    statusCode: text('status_code').notNull().default('unset'),
    statusMessage: text('status_message'),
    // JSON object of arbitrary key/value attributes.
    attributes: text('attributes').notNull().default('{}'),
    // JSON array of { name, time, attributes } span events.
    events: text('events').notNull().default('[]'),
    // JSON object describing the emitter (service.name, version, runtime, or a
    // browser user agent / page url for frontend spans).
    resource: text('resource').notNull().default('{}'),
    // Per-tab (frontend) or per-boot (backend) grouping id.
    sessionId: text('session_id'),
    // Ingest time in epoch millis — the key retention purges against.
    createdAt: integer('created_at').notNull()
  },
  (table) => [
    index('spans_trace_id_idx').on(table.traceId),
    index('spans_trace_start_idx').on(table.traceId, table.startTime),
    index('spans_status_idx').on(table.statusCode),
    index('spans_created_idx').on(table.createdAt),
    index('spans_parent_idx').on(table.parentSpanId),
    index('spans_route_idx').on(table.route)
  ]
)

// A denormalized index of failures. Every error-status span writes a derived
// row here, and frontend runtime errors that have no owning span (window
// onerror, unhandledrejection) are recorded here directly. This powers the
// "recent errors" view without scanning every span, and keeps span-less
// frontend errors representable.
export const errors = sqliteTable(
  'errors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Nullable: a span-less frontend error has no trace to attach to.
    traceId: text('trace_id'),
    spanId: text('span_id'),
    source: text('source').notNull(),
    // 'exception' | 'http' | 'unhandledrejection' | 'console'
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    // Page url (frontend) or request url (backend).
    url: text('url'),
    attributes: text('attributes').notNull().default('{}'),
    // When the error happened, epoch millis.
    timestamp: integer('timestamp').notNull(),
    // Ingest time in epoch millis — the key retention purges against.
    createdAt: integer('created_at').notNull()
  },
  (table) => [
    index('errors_created_idx').on(table.createdAt),
    index('errors_trace_idx').on(table.traceId),
    index('errors_source_idx').on(table.source)
  ]
)

export type ErrorRow = typeof errors.$inferSelect
export type NewErrorRow = typeof errors.$inferInsert
export type SpanRow = typeof spans.$inferSelect
export type NewSpanRow = typeof spans.$inferInsert
