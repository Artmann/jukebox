import { Duration, Effect } from 'effect'

import { TelemetryDatabase } from './layer'
import { errors, spans } from './schema'
import type { NewErrorRow, NewSpanRow } from './schema'

// Cap the in-memory buffer so a burst (or a stalled writer) can never grow
// unbounded and exhaust memory — excess records are dropped.
const maxBufferSize = 10_000
// Rows per transaction. better-sqlite3 is synchronous, so a modest batch keeps
// a single flush from stalling the event loop.
const batchSize = 500
const flushInterval = Duration.seconds(1)

interface SpanEvent {
  attributes?: Record<string, unknown>
  name: string
  time: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function pushBounded<Row>(buffer: Row[], rows: readonly Row[]): void {
  for (const row of rows) {
    if (buffer.length >= maxBufferSize) {
      return
    }

    buffer.push(row)
  }
}

// An error-status span is mirrored into the errors table so the "recent errors"
// view is a single cheap query. The exception details come from the `exception`
// span event the tracer records on failure.
function deriveErrorRow(span: NewSpanRow): NewErrorRow {
  let name = span.name
  let message = span.statusMessage ?? 'Error'
  let stack: string | null = null

  try {
    const events = JSON.parse(span.events ?? '[]') as SpanEvent[]
    const exception = events.find((event) => event.name === 'exception')

    if (exception?.attributes) {
      const attributes = exception.attributes

      if (typeof attributes['exception.type'] === 'string') {
        name = attributes['exception.type']
      }

      if (typeof attributes['exception.message'] === 'string') {
        message = attributes['exception.message']
      }

      if (typeof attributes['exception.stacktrace'] === 'string') {
        stack = attributes['exception.stacktrace']
      }
    }
  } catch {
    // Keep the defaults derived from the span if the events JSON is unreadable.
  }

  return {
    attributes: '{}',
    createdAt: span.createdAt,
    kind: 'exception',
    message,
    name,
    source: span.source,
    spanId: span.spanId,
    stack,
    timestamp: span.endTime,
    traceId: span.traceId,
    url: span.route ?? null
  }
}

// The batched telemetry sink. The tracer's synchronous `span.end` and the
// frontend ingest endpoint both push into an in-memory buffer; a background
// fiber drains it into SQLite once a second in one transaction per batch, so
// span writes never sit on the request path.
export class TelemetryWriter extends Effect.Service<TelemetryWriter>()(
  'jukebox/TelemetryWriter',
  {
    scoped: Effect.gen(function* () {
      const database = yield* TelemetryDatabase

      const spanBuffer: NewSpanRow[] = []
      const errorBuffer: NewErrorRow[] = []

      const enqueue = (record: NewSpanRow): void => {
        pushBounded(spanBuffer, [record])
      }

      const ingest = (
        spanRows: readonly NewSpanRow[],
        errorRows: readonly NewErrorRow[]
      ): void => {
        pushBounded(spanBuffer, spanRows)
        pushBounded(errorBuffer, errorRows)
      }

      const writeBatch = (
        spanRows: NewSpanRow[],
        errorRows: NewErrorRow[]
      ): Effect.Effect<void> =>
        Effect.try({
          try: () => {
            database.transaction((transaction) => {
              if (spanRows.length > 0) {
                transaction.insert(spans).values(spanRows).run()
              }

              if (errorRows.length > 0) {
                transaction.insert(errors).values(errorRows).run()
              }
            })
          },
          catch: (error) => error
        }).pipe(
          Effect.catchAll((error) =>
            Effect.logError(
              `Failed to write telemetry batch: ${errorMessage(error)}`
            )
          )
        )

      const flushBatch: Effect.Effect<void> = Effect.gen(function* () {
        const spanRows = spanBuffer.splice(0, batchSize)
        const errorRows = errorBuffer.splice(0, batchSize)
        const derivedErrors = spanRows
          .filter((row) => row.statusCode === 'error')
          .map(deriveErrorRow)
        const errorBatch = [...errorRows, ...derivedErrors]

        if (spanRows.length === 0 && errorBatch.length === 0) {
          return
        }

        yield* writeBatch(spanRows, errorBatch)
      })

      // Drain the whole buffer in batches. Exits when the buffers are empty.
      const drain: Effect.Effect<void> = Effect.gen(function* () {
        while (spanBuffer.length > 0 || errorBuffer.length > 0) {
          yield* flushBatch
        }
      })

      const loop: Effect.Effect<void> = Effect.gen(function* () {
        while (true) {
          yield* Effect.sleep(flushInterval)
          yield* drain
        }
      })

      // Flush whatever is buffered when the app shuts down.
      yield* Effect.addFinalizer(() => drain.pipe(Effect.ignore))

      yield* Effect.forkScoped(loop)

      return { enqueue, ingest } as const
    })
  }
) {}
