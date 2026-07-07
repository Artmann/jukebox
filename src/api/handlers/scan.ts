import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { ScanManager } from '../../services/scan-manager'
import { jukeboxApi } from '../contract'
import { BadRequest, InternalError } from '../contract/errors'

import {
  internalTryPromise,
  serializeLibrary,
  serializeScanJob,
  withHandlerSpan
} from './support'

// Ports the JSON routes of src/api/routes/scan.ts. GET /scan/stream (SSE)
// stays out of the HttpApi — it is a raw router route in scan-stream.ts.
export const scanHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'scan',
  (handlers) =>
    handlers
      .handle('listLibraries', () =>
        withHandlerSpan('listLibraries',
          Effect.gen(function* () {
            const db = yield* Database

            const libraries = yield* internalTryPromise(() =>
              db.select().from(schema.libraries)
            )

            return libraries.map(serializeLibrary)
          })
        )
      )
      .handle('getStatus', () =>
        withHandlerSpan('getStatus',
          Effect.gen(function* () {
            const scanManager = yield* ScanManager

            const status = yield* scanManager.getStatus.pipe(
              Effect.mapError(
                (error) => new InternalError({ message: error.message })
              )
            )

            return {
              currentJob: status.currentJob
                ? serializeScanJob(status.currentJob)
                : null,
              isRunning: status.isRunning,
              lastJob: status.lastJob ? serializeScanJob(status.lastJob) : null
            }
          })
        )
      )
      .handle('startScan', () =>
        withHandlerSpan('startScan',
          Effect.gen(function* () {
            const db = yield* Database
            const scanManager = yield* ScanManager

            const libraries = yield* internalTryPromise(() =>
              db.select().from(schema.libraries)
            )

            if (libraries.length === 0) {
              return yield* Effect.fail(
                new BadRequest({
                  message:
                    'No libraries configured. Add a library in Settings before scanning.'
                })
              )
            }

            const running = yield* scanManager.isRunning

            if (running) {
              return { status: 'already-running' as const }
            }

            // Fire and forget — the client watches /stream or polls /status
            // for progress. forkDaemon detaches the scan from this request so
            // the response returns immediately, like Hono's un-awaited
            // scanManager.start(). The service re-checks isRunning, so a race
            // that started a scan between the check and the fork is a no-op.
            yield* Effect.forkDaemon(
              scanManager.start.pipe(
                Effect.tapErrorCause((cause) =>
                  Effect.logError('Manual scan failed', cause)
                )
              )
            )

            return { status: 'started' as const }
          })
        )
      )
)
