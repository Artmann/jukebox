import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { db, schema } from '../../database'
import { scanManager } from '../../services/scan-manager'
import type {
  FileScannedEvent,
  LibraryCompleteEvent,
  LibraryErrorEvent,
  LibraryStartEvent,
  ScanCompleteEvent
} from '../../services/scan-manager'

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
    currentJob: status.currentJob
      ? {
          added: status.currentJob.added,
          endedAt: status.currentJob.endedAt?.toISOString() ?? null,
          errorMessage: status.currentJob.errorMessage,
          id: status.currentJob.id,
          startedAt: status.currentJob.startedAt.toISOString(),
          status: status.currentJob.status,
          total: status.currentJob.total,
          updated: status.currentJob.updated
        }
      : null,
    isRunning: status.isRunning,
    lastJob: status.lastJob
      ? {
          added: status.lastJob.added,
          endedAt: status.lastJob.endedAt?.toISOString() ?? null,
          errorMessage: status.lastJob.errorMessage,
          id: status.lastJob.id,
          startedAt: status.lastJob.startedAt.toISOString(),
          status: status.lastJob.status,
          total: status.lastJob.total,
          updated: status.lastJob.updated
        }
      : null
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
    // a comment-only keep-alive so proxies don't time out the connection.
    stream.onAbort(() => {
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
