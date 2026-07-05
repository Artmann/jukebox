import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { scanManager } from '../../services/scan-manager'
import { jukeboxApi } from '../contract'
import { BadRequest } from '../contract/errors'

import {
  internalTryPromise,
  serializeLibrary,
  serializeScanJob,
  withInternalFallback
} from './support'

// Ports the JSON routes of src/api/routes/scan.ts. GET /scan/stream (SSE)
// stays out of the HttpApi — it becomes a raw router route in Phase 6.
// scanManager is still the plain-async singleton; Phase 5 turns it into an
// Effect service.
export const scanHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'scan',
  (handlers) =>
    handlers
      .handle('listLibraries', () =>
        withInternalFallback(
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
        withInternalFallback(
          Effect.gen(function* () {
            const status = yield* internalTryPromise(() =>
              scanManager.getStatus()
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
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

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

            if (scanManager.isRunning()) {
              return { status: 'already-running' as const }
            }

            // Fire and forget — the client watches /stream or polls /status
            // for progress. The response returns immediately, like Hono's
            // un-awaited scanManager.start().
            yield* Effect.sync(() => {
              scanManager.start().catch((caughtError: unknown) => {
                const message =
                  caughtError instanceof Error
                    ? caughtError.message
                    : 'Unknown error'

                console.error(`Manual scan failed: ${message}`)
              })
            })

            return { status: 'started' as const }
          })
        )
      )
)
