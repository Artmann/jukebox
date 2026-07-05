import { HttpApiBuilder, HttpServerResponse } from '@effect/platform'
import { Effect, Ref, Schedule, Stream } from 'effect'

import { Database } from '../../database/layer'
import { ScanManager } from '../../services/scan-manager'
import type { ScanEvent } from '../../services/scan-manager'
import { makeSessionCheck } from '../middleware/session'

const encoder = new TextEncoder()

function sseFrame(event: string, data: string): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${data}\n\n`)
}

// Map a ScanManager event onto its SSE frame. The wire names and payloads
// stay byte-compatible with the old Hono streamSSE route: the PubSub tags
// 'scan-started'/'scan-complete' already match the wire event names, and
// scan-complete renames `total` to `found`.
function scanEventFrame(event: ScanEvent): Uint8Array {
  switch (event._tag) {
    case 'scan-started': {
      return sseFrame(
        'scan-started',
        JSON.stringify({
          jobId: event.jobId,
          startedAt: event.startedAt.toISOString()
        })
      )
    }

    case 'library-start': {
      return sseFrame(
        'library-start',
        JSON.stringify({
          index: event.index,
          libraryId: event.libraryId,
          name: event.name,
          type: event.type
        })
      )
    }

    case 'file-scanned': {
      return sseFrame(
        'file-scanned',
        JSON.stringify({
          added: event.added,
          index: event.index,
          libraryId: event.libraryId,
          total: event.total,
          updated: event.updated
        })
      )
    }

    case 'library-complete': {
      return sseFrame(
        'library-complete',
        JSON.stringify({
          added: event.added,
          index: event.index,
          libraryId: event.libraryId,
          total: event.total,
          updated: event.updated
        })
      )
    }

    case 'library-error': {
      return sseFrame(
        'library-error',
        JSON.stringify({
          error: event.error,
          index: event.index,
          libraryId: event.libraryId
        })
      )
    }

    case 'scan-complete': {
      return sseFrame(
        'scan-complete',
        JSON.stringify({
          added: event.added,
          errorMessage: event.errorMessage,
          found: event.total,
          status: event.status,
          updated: event.updated
        })
      )
    }
  }
}

// GET /api/scan/stream sits outside the HttpApi (SSE has no schema), so it
// registers directly on the api's router and applies the session check
// itself. The per-connection PubSub subscription is scoped to the request, so
// a client disconnect (stream interruption) unsubscribes automatically.
export const scanStreamRouteLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const db = yield* Database
    const scanManager = yield* ScanManager
    const lastSweepAtRef = yield* Ref.make(0)

    yield* router.get(
      '/api/scan/stream',
      Effect.gen(function* () {
        yield* makeSessionCheck(db, lastSweepAtRef)

        const scanEvents = scanManager.events.pipe(Stream.map(scanEventFrame))

        // The initial `ready` heartbeat transitions EventSource to OPEN even
        // when no scan is running; pings keep proxies from timing out the
        // connection.
        const ready = Stream.make(
          sseFrame('ready', JSON.stringify({ at: new Date().toISOString() }))
        )
        const pings = Stream.fromSchedule(Schedule.spaced('15 seconds')).pipe(
          Stream.map(() => sseFrame('ping', '{}'))
        )

        return HttpServerResponse.stream(
          Stream.concat(ready, Stream.merge(scanEvents, pings)),
          {
            contentType: 'text/event-stream',
            headers: {
              'cache-control': 'no-cache',
              connection: 'keep-alive'
            }
          }
        )
      }).pipe(
        Effect.catchTags({
          InternalError: (error) =>
            HttpServerResponse.json(
              { error: { message: error.message } },
              { status: 500 }
            ).pipe(Effect.orDie),
          Unauthorized: (error) =>
            HttpServerResponse.json(
              { error: { message: error.message } },
              { status: 401 }
            ).pipe(Effect.orDie)
        })
      )
    )
  })
)
