import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { db, schema } from '../../database'
import { parseLibraryResults, scanManager } from '../../services/scan-manager'
import type {
  FileScannedEvent,
  LibraryCompleteEvent,
  LibraryErrorEvent,
  LibraryStartEvent,
  ScanCompleteEvent
} from '../../services/scan-manager'
import type { ScanJob } from '../../database/schema'

function serializeJob(job: ScanJob) {
  return {
    added: job.added,
    endedAt: job.endedAt?.toISOString() ?? null,
    errorMessage: job.errorMessage,
    id: job.id,
    libraries: parseLibraryResults(job.libraryResults),
    startedAt: job.startedAt.toISOString(),
    status: job.status,
    total: job.total,
    updated: job.updated
  }
}

const scanRoutes = new Hono()

scanRoutes.get('/libraries', async (context) => {
  const libraries = await db.select().from(schema.libraries)

  return context.json(
    libraries.map((library) => ({
      id: library.id,
      name: library.name,
      path: library.path,
      type: library.type
    }))
  )
})

scanRoutes.get('/status', async (context) => {
  const status = await scanManager.getStatus()

  return context.json({
    currentJob: status.currentJob ? serializeJob(status.currentJob) : null,
    isRunning: status.isRunning,
    lastJob: status.lastJob ? serializeJob(status.lastJob) : null
  })
})

scanRoutes.post('/start', async (context) => {
  const libraries = await db.select().from(schema.libraries)

  if (libraries.length === 0) {
    return context.json(
      {
        error: {
          message:
            'No libraries configured. Add a library in Settings before scanning.'
        }
      },
      400
    )
  }

  if (scanManager.isRunning()) {
    return context.json({ status: 'already-running' })
  }

  // Fire and forget — the client watches /stream or polls /status for
  // progress. Don't await so the HTTP response returns immediately.
  scanManager.start().catch((caughtError: unknown) => {
    const message =
      caughtError instanceof Error ? caughtError.message : 'Unknown error'

    console.error(`Manual scan failed: ${message}`)
  })

  return context.json({ status: 'started' })
})

scanRoutes.get('/stream', (context) => {
  return streamSSE(context, async (stream) => {
    const onJobStarted = (event: { jobId: number; startedAt: Date }) => {
      void stream.writeSSE({
        event: 'scan-started',
        data: JSON.stringify({
          jobId: event.jobId,
          startedAt: event.startedAt.toISOString()
        })
      })
    }

    const onLibraryStart = (event: LibraryStartEvent) => {
      void stream.writeSSE({
        event: 'library-start',
        data: JSON.stringify(event)
      })
    }

    const onFileScanned = (event: FileScannedEvent) => {
      void stream.writeSSE({
        event: 'file-scanned',
        data: JSON.stringify(event)
      })
    }

    const onLibraryComplete = (event: LibraryCompleteEvent) => {
      void stream.writeSSE({
        event: 'library-complete',
        data: JSON.stringify(event)
      })
    }

    const onLibraryError = (event: LibraryErrorEvent) => {
      void stream.writeSSE({
        event: 'library-error',
        data: JSON.stringify(event)
      })
    }

    const onScanComplete = (event: ScanCompleteEvent) => {
      void stream.writeSSE({
        event: 'scan-complete',
        data: JSON.stringify({
          added: event.added,
          errorMessage: event.errorMessage,
          found: event.total,
          status: event.status,
          updated: event.updated
        })
      })
    }

    scanManager.on('job-started', onJobStarted as (...args: unknown[]) => void)
    scanManager.on('library-start', onLibraryStart as (...args: unknown[]) => void)
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

    // Send an initial heartbeat so EventSource transitions to OPEN even if
    // no scan is currently running.
    await stream.writeSSE({
      event: 'ready',
      data: JSON.stringify({ at: new Date().toISOString() })
    })

    // Keep the stream open until the client disconnects. Periodically write
    // a ping so proxies don't time out the connection.
    stream.onAbort(() => {
      scanManager.off(
        'job-started',
        onJobStarted as (...args: unknown[]) => void
      )
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

    const keepAliveMs = 15_000

    try {
      while (!stream.aborted && !stream.closed) {
        if (stream.aborted || stream.closed) {
          break
        }

        await stream.sleep(keepAliveMs)

        if (stream.aborted || stream.closed) {
          break
        }

        await stream.writeSSE({ event: 'ping', data: '{}' })
      }
    } catch {
      // Stream closed by client — cleanup runs via onAbort.
    }
  })
})

export { scanRoutes }
