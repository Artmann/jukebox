import { desc, eq } from 'drizzle-orm'
import { Effect, PubSub, Ref, Stream } from 'effect'
import type { Scope } from 'effect'
import invariant from 'tiny-invariant'

import { Database } from '../database/layer'
import * as schema from '../database/schema'
import type { ScanJob } from '../database/schema'

import { Scanner } from './scanner'
import { ShowScanner } from './show-scanner'

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

// The tagged union carried by the ScanManager's PubSub. Tags match the SSE
// event names on /api/scan/stream (the old EventEmitter's 'job-started' and
// 'job-completed' are 'scan-started' and 'scan-complete' on the wire).
export type ScanEvent =
  | { _tag: 'scan-started'; jobId: number; startedAt: Date }
  | ({ _tag: 'library-start' } & LibraryStartEvent)
  | ({ _tag: 'file-scanned' } & FileScannedEvent)
  | ({ _tag: 'library-complete' } & LibraryCompleteEvent)
  | ({ _tag: 'library-error' } & LibraryErrorEvent)
  | ({ _tag: 'scan-complete' } & ScanCompleteEvent)

export interface LibraryScanResult {
  added: number
  error: string | null
  libraryId: number
  name: string
  status: 'complete' | 'error'
  total: number
  updated: number
}

export interface ScanManagerStatus {
  currentJob: ScanJob | null
  isRunning: boolean
  lastJob: ScanJob | null
}

export function parseLibraryResults(
  serialized: string | null
): LibraryScanResult[] {
  if (serialized === null) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(serialized)

    return Array.isArray(parsed) ? (parsed as LibraryScanResult[]) : []
  } catch {
    return []
  }
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

const interruptedMessage =
  'Server restarted mid-scan. Run a manual scan to resume.'

function toError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught))
}

const tryPromise = <A>(run: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({ catch: toError, try: run })

// Runs full-library scans sequentially, persists progress to the scan_jobs
// table, and broadcasts progress events on a PubSub. The scoped factory runs
// crash recovery (marking jobs orphaned by a restart) before the service is
// available, which is what lets the Scheduler layer depend on recovery having
// finished.
export class ScanManager extends Effect.Service<ScanManager>()(
  'jukebox/ScanManager',
  {
    dependencies: [Scanner.Default, ShowScanner.Default],
    scoped: Effect.gen(function* () {
      const database = yield* Database
      const scanner = yield* Scanner
      const showScanner = yield* ShowScanner

      const currentJobRef = yield* Ref.make<ScanJob | null>(null)

      const pubsub = yield* Effect.acquireRelease(
        PubSub.unbounded<ScanEvent>(),
        (queue) => PubSub.shutdown(queue)
      )

      const publish = (event: ScanEvent): Effect.Effect<void> =>
        PubSub.publish(pubsub, event).pipe(Effect.asVoid)

      const getStatus: Effect.Effect<ScanManagerStatus, Error> = Effect.gen(
        function* () {
          const currentJob = yield* Ref.get(currentJobRef)

          if (currentJob) {
            const [latest] = yield* tryPromise(() =>
              database
                .select()
                .from(schema.scanJobs)
                .where(eq(schema.scanJobs.id, currentJob.id))
                .limit(1)
            )

            return {
              currentJob: latest ?? currentJob,
              isRunning: true,
              lastJob: latest ?? currentJob
            }
          }

          const [last] = yield* tryPromise(() =>
            database
              .select()
              .from(schema.scanJobs)
              .orderBy(desc(schema.scanJobs.startedAt))
              .limit(1)
          )

          return {
            currentJob: null,
            isRunning: false,
            lastJob: last ?? null
          }
        }
      )

      const isRunning: Effect.Effect<boolean> = Ref.get(currentJobRef).pipe(
        Effect.map((job) => job !== null)
      )

      const recoverInterruptedJobs: Effect.Effect<void, Error> = Effect.gen(
        function* () {
          const now = new Date()

          const running = yield* tryPromise(() =>
            database
              .select()
              .from(schema.scanJobs)
              .where(eq(schema.scanJobs.status, 'running'))
          )

          if (running.length === 0) {
            return
          }

          yield* tryPromise(() =>
            database
              .update(schema.scanJobs)
              .set({
                endedAt: now,
                errorMessage: interruptedMessage,
                status: 'error'
              })
              .where(eq(schema.scanJobs.status, 'running'))
          )

          yield* Effect.logInfo(
            `Marked ${running.length} interrupted scan job(s) as failed after a restart.`
          )
        }
      )

      const start: Effect.Effect<StartResult, Error> = Effect.gen(function* () {
        const runningJob = yield* Ref.get(currentJobRef)

        if (runningJob) {
          return { status: 'already-running' as const }
        }

        const libraries = yield* tryPromise(() =>
          database.select().from(schema.libraries)
        )

        if (libraries.length === 0) {
          return {
            status: 'no-libraries' as const,
            message:
              'No libraries configured. Add a library in Settings before scanning.'
          }
        }

        const startedAt = new Date()

        const [inserted] = yield* tryPromise(() =>
          database
            .insert(schema.scanJobs)
            .values({
              startedAt,
              status: 'running',
              added: 0,
              updated: 0,
              total: 0
            })
            .returning()
        )

        invariant(inserted, 'Failed to create scan_jobs row.')

        yield* Ref.set(currentJobRef, inserted)

        yield* publish({
          _tag: 'scan-started',
          jobId: inserted.id,
          startedAt: inserted.startedAt
        })

        let totalAdded = 0
        let totalUpdated = 0
        let totalFound = 0
        const libraryErrors: string[] = []
        const libraryResults: LibraryScanResult[] = []

        // Persist per-library results as they land so a page opened mid-scan
        // (or after the scan finished) can reconstruct each library's outcome.
        const persistLibraryResult = (result: LibraryScanResult) =>
          Effect.gen(function* () {
            libraryResults.push(result)

            yield* tryPromise(() =>
              database
                .update(schema.scanJobs)
                .set({ libraryResults: JSON.stringify(libraryResults) })
                .where(eq(schema.scanJobs.id, inserted.id))
            )
          })

        const runLibraries: Effect.Effect<StartResult, Error> = Effect.gen(
          function* () {
            for (let index = 0; index < libraries.length; index++) {
              const library = libraries[index]

              if (!library) {
                continue
              }

              const libraryType = library.type === 'shows' ? 'shows' : 'movies'

              yield* publish({
                _tag: 'library-start',
                index,
                libraryId: library.id,
                name: library.name,
                type: libraryType
              })

              const onProgress = (progress: ScanProgressPayload) =>
                Effect.gen(function* () {
                  const aggregate = {
                    added: totalAdded + progress.added,
                    total: totalFound + progress.total,
                    updated: totalUpdated + progress.updated
                  }

                  yield* tryPromise(() =>
                    database
                      .update(schema.scanJobs)
                      .set(aggregate)
                      .where(eq(schema.scanJobs.id, inserted.id))
                  )

                  yield* publish({
                    _tag: 'file-scanned',
                    ...progress,
                    index,
                    libraryId: library.id
                  })
                }).pipe(Effect.orDie)

              const outcome = yield* (
                libraryType === 'shows'
                  ? showScanner.scanShowLibrary(library.path, onProgress)
                  : scanner.scanLibrary(library.path, onProgress)
              ).pipe(Effect.either)

              if (outcome._tag === 'Right') {
                const result = outcome.right

                totalAdded += result.added
                totalUpdated += result.updated
                totalFound += result.total

                yield* persistLibraryResult({
                  added: result.added,
                  error: null,
                  libraryId: library.id,
                  name: library.name,
                  status: 'complete',
                  total: result.total,
                  updated: result.updated
                })

                yield* publish({
                  _tag: 'library-complete',
                  added: result.added,
                  updated: result.updated,
                  total: result.total,
                  index,
                  libraryId: library.id
                })
              } else {
                const message =
                  outcome.left instanceof Error
                    ? outcome.left.message
                    : 'Unknown error'

                libraryErrors.push(`${library.name} — ${message}`)

                yield* persistLibraryResult({
                  added: 0,
                  error: message,
                  libraryId: library.id,
                  name: library.name,
                  status: 'error',
                  total: 0,
                  updated: 0
                })

                yield* publish({
                  _tag: 'library-error',
                  error: message,
                  index,
                  libraryId: library.id
                })
              }
            }

            const endedAt = new Date()
            const status = libraryErrors.length > 0 ? 'error' : 'done'
            const errorMessage =
              libraryErrors.length > 0 ? libraryErrors.join('; ') : null

            yield* tryPromise(() =>
              database
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
            )

            yield* publish({
              _tag: 'scan-complete',
              added: totalAdded,
              errorMessage,
              jobId: inserted.id,
              status,
              total: totalFound,
              updated: totalUpdated
            })

            return {
              added: totalAdded,
              errorMessage: errorMessage ?? undefined,
              status,
              total: totalFound,
              updated: totalUpdated
            }
          }
        )

        // A failure that escapes the per-library handling (e.g. a scan_jobs
        // write failing) still marks the job row as errored and answers with
        // an error result, like the old try/catch did.
        return yield* runLibraries.pipe(
          Effect.catchAll((caughtError) =>
            Effect.gen(function* () {
              const endedAt = new Date()
              const message =
                caughtError instanceof Error
                  ? caughtError.message
                  : 'Unknown error'

              yield* tryPromise(() =>
                database
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
              )

              return {
                added: totalAdded,
                errorMessage: message,
                status: 'error' as const,
                total: totalFound,
                updated: totalUpdated
              }
            })
          ),
          Effect.ensuring(Ref.set(currentJobRef, null))
        )
      })

      // Crash recovery runs as part of building the layer, before anything
      // can depend on the service (the Scheduler layer in particular).
      yield* recoverInterruptedJobs

      const events: Stream.Stream<ScanEvent> = Stream.fromPubSub(pubsub)

      const subscribe: Effect.Effect<
        Stream.Stream<ScanEvent>,
        never,
        Scope.Scope
      > = Stream.fromPubSub(pubsub, { scoped: true })

      return {
        events,
        getStatus,
        isRunning,
        recoverInterruptedJobs,
        // A library scan is a long background operation worth its own trace, so
        // callers (the scan handler and the scheduler) record a span around it.
        start: start.pipe(Effect.withSpan('ScanManager.start', { kind: 'internal' })),
        subscribe
      }
    })
  }
) {}
