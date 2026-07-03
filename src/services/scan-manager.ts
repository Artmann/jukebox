import { EventEmitter } from 'node:events'

import { desc, eq } from 'drizzle-orm'
import invariant from 'tiny-invariant'
import { log } from 'tiny-typescript-logger'

import { db, schema } from '../database'
import type { ScanJob } from '../database/schema'

import { scanLibrary as defaultScanLibrary } from './scanner'
import { scanShowLibrary as defaultScanShowLibrary } from './show-scanner'

export interface ScanProgressPayload {
  added: number
  total: number
  updated: number
}

export interface LibraryStartEvent {
  index: number
  libraryId: number
  name: string
  type: 'movies' | 'shows'
}

export interface LibraryCompleteEvent extends ScanProgressPayload {
  index: number
  libraryId: number
}

export interface LibraryErrorEvent {
  index: number
  libraryId: number
  error: string
}

export interface FileScannedEvent extends ScanProgressPayload {
  index: number
  libraryId: number
}

export interface ScanCompleteEvent extends ScanProgressPayload {
  jobId: number
  status: 'done' | 'error'
  errorMessage: string | null
}

export interface ScanManagerStatus {
  currentJob: ScanJob | null
  isRunning: boolean
  lastJob: ScanJob | null
}

export type StartResult =
  | { status: 'already-running' }
  | { status: 'no-libraries'; message: string }
  | {
      added: number
      status: 'done' | 'error'
      total: number
      updated: number
      errorMessage?: string
    }

type ScanLibraryFunction = (
  libraryPath: string,
  onProgress?: (progress: ScanProgressPayload) => void | Promise<void>
) => Promise<ScanProgressPayload>

interface ScanManagerDependencies {
  database?: typeof db
  scanLibrary?: ScanLibraryFunction
  scanShowLibrary?: ScanLibraryFunction
}

export interface ScanManager {
  getStatus(): Promise<ScanManagerStatus>
  isRunning(): boolean
  off(event: string, listener: (...args: unknown[]) => void): void
  on(event: string, listener: (...args: unknown[]) => void): void
  recoverInterruptedJobs(): Promise<void>
  start(): Promise<StartResult>
}

const interruptedMessage =
  'Server restarted mid-scan. Run a manual scan to resume.'

export function createScanManager(
  dependencies: ScanManagerDependencies = {}
): ScanManager {
  const database = dependencies.database ?? db
  const scanLibrary = dependencies.scanLibrary ?? defaultScanLibrary
  const scanShowLibrary = dependencies.scanShowLibrary ?? defaultScanShowLibrary

  const emitter = new EventEmitter()
  emitter.setMaxListeners(0)

  let currentJob: ScanJob | null = null

  async function getStatus(): Promise<ScanManagerStatus> {
    if (currentJob) {
      const [latest] = await database
        .select()
        .from(schema.scanJobs)
        .where(eq(schema.scanJobs.id, currentJob.id))
        .limit(1)

      return {
        currentJob: latest ?? currentJob,
        isRunning: true,
        lastJob: latest ?? currentJob
      }
    }

    const [last] = await database
      .select()
      .from(schema.scanJobs)
      .orderBy(desc(schema.scanJobs.startedAt))
      .limit(1)

    return {
      currentJob: null,
      isRunning: false,
      lastJob: last ?? null
    }
  }

  function isRunning(): boolean {
    return currentJob !== null
  }

  async function recoverInterruptedJobs(): Promise<void> {
    const now = new Date()

    const running = await database
      .select()
      .from(schema.scanJobs)
      .where(eq(schema.scanJobs.status, 'running'))

    if (running.length === 0) {
      return
    }

    await database
      .update(schema.scanJobs)
      .set({
        endedAt: now,
        errorMessage: interruptedMessage,
        status: 'error'
      })
      .where(eq(schema.scanJobs.status, 'running'))

    log.info(
      `Marked ${running.length} interrupted scan job(s) as failed after a restart.`
    )
  }

  async function start(): Promise<StartResult> {
    if (currentJob) {
      return { status: 'already-running' }
    }

    const libraries = await database.select().from(schema.libraries)

    if (libraries.length === 0) {
      return {
        status: 'no-libraries',
        message:
          'No libraries configured. Add a library in Settings before scanning.'
      }
    }

    const startedAt = new Date()

    const [inserted] = await database
      .insert(schema.scanJobs)
      .values({
        startedAt,
        status: 'running',
        added: 0,
        updated: 0,
        total: 0
      })
      .returning()

    invariant(inserted, 'Failed to create scan_jobs row.')

    currentJob = inserted

    emitter.emit('job-started', {
      jobId: inserted.id,
      startedAt: inserted.startedAt
    })

    let totalAdded = 0
    let totalUpdated = 0
    let totalFound = 0
    const libraryErrors: string[] = []

    try {
      for (let index = 0; index < libraries.length; index++) {
        const library = libraries[index]

        if (!library) {
          continue
        }

        const libraryType = library.type === 'shows' ? 'shows' : 'movies'

        emitter.emit('library-start', {
          index,
          libraryId: library.id,
          name: library.name,
          type: libraryType
        } satisfies LibraryStartEvent)

        const onProgress = async (progress: ScanProgressPayload) => {
          const aggregate = {
            added: totalAdded + progress.added,
            total: totalFound + progress.total,
            updated: totalUpdated + progress.updated
          }

          await database
            .update(schema.scanJobs)
            .set(aggregate)
            .where(eq(schema.scanJobs.id, inserted.id))

          emitter.emit('file-scanned', {
            ...progress,
            index,
            libraryId: library.id
          } satisfies FileScannedEvent)
        }

        try {
          const result =
            libraryType === 'shows'
              ? await scanShowLibrary(library.path, onProgress)
              : await scanLibrary(library.path, onProgress)

          totalAdded += result.added
          totalUpdated += result.updated
          totalFound += result.total

          emitter.emit('library-complete', {
            ...result,
            index,
            libraryId: library.id
          } satisfies LibraryCompleteEvent)
        } catch (caughtError) {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : 'Unknown error'

          libraryErrors.push(`${library.name} — ${message}`)

          emitter.emit('library-error', {
            error: message,
            index,
            libraryId: library.id
          } satisfies LibraryErrorEvent)
        }
      }

      const endedAt = new Date()
      const status = libraryErrors.length > 0 ? 'error' : 'done'
      const errorMessage =
        libraryErrors.length > 0 ? libraryErrors.join('; ') : null

      await database
        .update(schema.scanJobs)
        .set({
          added: totalAdded,
          endedAt,
          errorMessage,
          status,
          total: totalFound,
          updated: totalUpdated
        })
        .where(eq(schema.scanJobs.id, inserted.id))

      const payload: ScanCompleteEvent = {
        added: totalAdded,
        errorMessage,
        jobId: inserted.id,
        status,
        total: totalFound,
        updated: totalUpdated
      }

      emitter.emit('job-completed', payload)

      return {
        added: totalAdded,
        errorMessage: errorMessage ?? undefined,
        status,
        total: totalFound,
        updated: totalUpdated
      }
    } catch (caughtError) {
      const endedAt = new Date()
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unknown error'

      await database
        .update(schema.scanJobs)
        .set({
          added: totalAdded,
          endedAt,
          errorMessage: message,
          status: 'error',
          total: totalFound,
          updated: totalUpdated
        })
        .where(eq(schema.scanJobs.id, inserted.id))

      emitter.emit('job-failed', {
        error: message,
        jobId: inserted.id
      })

      return {
        added: totalAdded,
        errorMessage: message,
        status: 'error',
        total: totalFound,
        updated: totalUpdated
      }
    } finally {
      currentJob = null
    }
  }

  return {
    getStatus,
    isRunning,
    off: (event, listener) => emitter.off(event, listener),
    on: (event, listener) => emitter.on(event, listener),
    recoverInterruptedJobs,
    start
  }
}

export const scanManager = createScanManager()
