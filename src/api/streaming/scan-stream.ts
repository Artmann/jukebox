import { HttpApiBuilder, HttpServerResponse } from '@effect/platform'
import { Effect, Ref, Schedule, Stream } from 'effect'

import { Database } from '../../database/layer'
import { scanManager } from '../../services/scan-manager'
import type {
  FileScannedEvent,
  LibraryCompleteEvent,
  LibraryErrorEvent,
  LibraryStartEvent,
  ScanCompleteEvent
} from '../../services/scan-manager'
import { makeSessionCheck } from '../middleware/session'

const encoder = new TextEncoder()

function sseFrame(event: string, data: string): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${data}\n\n`)
}

// Every scanManager event forwarded as an SSE frame, byte-compatible with
// the Hono streamSSE route: same event names, same payloads, including the
// `found`-for-`total` rename on scan-complete. Listener registration lives
// in Stream.async so a client disconnect (stream interruption) always
// unsubscribes.
const scanEvents = Stream.async<Uint8Array>((emit) => {
  const push = (event: string, data: unknown) => {
    void emit.single(sseFrame(event, JSON.stringify(data)))
  }

  const onJobStarted = (event: { jobId: number; startedAt: Date }) => {
    push('scan-started', {
      jobId: event.jobId,
      startedAt: event.startedAt.toISOString()
    })
  }

  const onLibraryStart = (event: LibraryStartEvent) => {
    push('library-start', event)
  }

  const onFileScanned = (event: FileScannedEvent) => {
    push('file-scanned', event)
  }

  const onLibraryComplete = (event: LibraryCompleteEvent) => {
    push('library-complete', event)
  }

  const onLibraryError = (event: LibraryErrorEvent) => {
    push('library-error', event)
  }

  const onScanComplete = (event: ScanCompleteEvent) => {
    push('scan-complete', {
      added: event.added,
      errorMessage: event.errorMessage,
      found: event.total,
      status: event.status,
      updated: event.updated
    })
  }

  scanManager.on('job-started', onJobStarted as (...args: unknown[]) => void)
  scanManager.on(
    'library-start',
    onLibraryStart as (...args: unknown[]) => void
  )
  scanManager.on('file-scanned', onFileScanned as (...args: unknown[]) => void)
  scanManager.on(
    'library-complete',
    onLibraryComplete as (...args: unknown[]) => void
  )
  scanManager.on(
    'library-error',
    onLibraryError as (...args: unknown[]) => void
  )
  scanManager.on(
    'job-completed',
    onScanComplete as (...args: unknown[]) => void
  )

  return Effect.sync(() => {
    scanManager.off('job-started', onJobStarted as (...args: unknown[]) => void)
    scanManager.off(
      'library-start',
      onLibraryStart as (...args: unknown[]) => void
    )
    scanManager.off(
      'file-scanned',
      onFileScanned as (...args: unknown[]) => void
    )
    scanManager.off(
      'library-complete',
      onLibraryComplete as (...args: unknown[]) => void
    )
    scanManager.off(
      'library-error',
      onLibraryError as (...args: unknown[]) => void
    )
    scanManager.off(
      'job-completed',
      onScanComplete as (...args: unknown[]) => void
    )
  })
})

// GET /api/scan/stream sits outside the HttpApi (SSE has no schema), so it
// registers directly on the api's router and applies the session check
// itself.
export const scanStreamRouteLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const db = yield* Database
    const lastSweepAtRef = yield* Ref.make(0)

    yield* router.get(
      '/api/scan/stream',
      Effect.gen(function* () {
        yield* makeSessionCheck(db, lastSweepAtRef)

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
