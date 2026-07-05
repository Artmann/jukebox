import { Clock, Duration, Effect, Exit, Fiber, Ref } from 'effect'
import type { Cause } from 'effect'

import { Database } from '../database/layer'

import { ScanManager } from './scan-manager'
import type { StartResult } from './scan-manager'
import {
  defaultScanSchedule,
  getSetting,
  isScanScheduleValue,
  scanScheduleSettingKey,
  type ScanScheduleValue
} from './settings'

export interface SchedulerInfo {
  nextRunAt: Date | null
  schedule: ScanScheduleValue
}

const millisecondsPerHour = 60 * 60 * 1000

export function scheduleIntervalMilliseconds(
  value: ScanScheduleValue
): number | null {
  switch (value) {
    case 'off':
      return null
    case '6h':
      return 6 * millisecondsPerHour
    case '12h':
      return 12 * millisecondsPerHour
    case '24h':
      return 24 * millisecondsPerHour
  }
}

function failureMessage(cause: Cause.Cause<Error>): string {
  if (cause._tag === 'Fail') {
    return cause.error.message
  }

  return 'Unknown error'
}

// Kicks off scheduled scans on a timer read from the settings table. The
// timer is a fiber forked into the service scope, so it dies with the layer
// on shutdown (this replaces the old scheduler.stop()). The layer depends on
// ScanManager, whose factory runs crash recovery — so recovery always
// completes before the scheduler arms.
export class Scheduler extends Effect.Service<Scheduler>()(
  'jukebox/Scheduler',
  {
    dependencies: [ScanManager.Default],
    scoped: Effect.gen(function* () {
      const database = yield* Database
      const scanManager = yield* ScanManager
      const scope = yield* Effect.scope

      const currentScheduleRef = yield* Ref.make<ScanScheduleValue>('off')
      const nextRunAtRef = yield* Ref.make<Date | null>(null)
      const timerRef = yield* Ref.make<Fiber.RuntimeFiber<void> | null>(null)

      const clearTimer: Effect.Effect<void> = Effect.gen(function* () {
        const timer = yield* Ref.get(timerRef)

        if (timer !== null) {
          yield* Fiber.interrupt(timer)
          yield* Ref.set(timerRef, null)
        }
      })

      const tick: Effect.Effect<void> = Effect.gen(function* () {
        const running = yield* scanManager.isRunning

        if (running) {
          yield* Effect.logDebug(
            'Scheduler tick skipped — a scan is already running.'
          )

          return
        }

        // The scan runs on a daemon fiber so that a schedule change (which
        // interrupts the timer fiber) never interrupts a scan in flight —
        // matching the old setTimeout scheduler, where a started scan always
        // ran to completion.
        const scanFiber = yield* Effect.forkDaemon(scanManager.start)
        const exit = yield* Fiber.await(scanFiber)

        if (Exit.isFailure(exit)) {
          yield* Effect.logWarning(
            `Scheduled scan failed to start: ${failureMessage(exit.cause)}. Check the scan page.`
          )

          return
        }

        const result: StartResult = exit.value

        if (result.status === 'error') {
          const message =
            'errorMessage' in result && result.errorMessage
              ? `: ${result.errorMessage}`
              : '.'

          yield* Effect.logWarning(
            `Scheduled scan finished with errors${message}`
          )
        } else if (result.status === 'no-libraries') {
          yield* Effect.logDebug(
            'Scheduled scan skipped — no libraries configured.'
          )
        }
      })

      // Sleep-tick loop on its own fiber. After each tick the schedule is
      // re-read so an updateSchedule that landed while a scan was running is
      // still honored.
      const loop = (initialIntervalMs: number): Effect.Effect<void> =>
        Effect.gen(function* () {
          let intervalMs = initialIntervalMs

          while (true) {
            yield* Effect.sleep(Duration.millis(intervalMs))
            yield* tick

            const active = yield* Ref.get(currentScheduleRef)
            const activeInterval = scheduleIntervalMilliseconds(active)

            if (activeInterval === null) {
              yield* Ref.set(nextRunAtRef, null)

              return
            }

            intervalMs = activeInterval

            const now = yield* Clock.currentTimeMillis

            yield* Ref.set(nextRunAtRef, new Date(now + intervalMs))
          }
        })

      const applySchedule = (value: ScanScheduleValue): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* Ref.set(currentScheduleRef, value)
          yield* clearTimer

          const intervalMs = scheduleIntervalMilliseconds(value)

          if (intervalMs === null) {
            yield* Ref.set(nextRunAtRef, null)
            yield* Effect.logInfo('Scan scheduler is off.')

            return
          }

          const now = yield* Clock.currentTimeMillis
          const nextRunAt = new Date(now + intervalMs)

          yield* Ref.set(nextRunAtRef, nextRunAt)

          const fiber = yield* loop(intervalMs).pipe(Effect.forkIn(scope))

          yield* Ref.set(timerRef, fiber)

          yield* Effect.logInfo(
            `Next scheduled scan at ${nextRunAt.toISOString()} (${value}).`
          )
        })

      const getInfo: Effect.Effect<SchedulerInfo> = Effect.gen(function* () {
        const nextRunAt = yield* Ref.get(nextRunAtRef)
        const schedule = yield* Ref.get(currentScheduleRef)

        return { nextRunAt, schedule }
      })

      const updateSchedule = (value: ScanScheduleValue): Effect.Effect<void> =>
        applySchedule(value)

      // Boot: read the stored schedule and arm the timer, like the old
      // scheduler.start() call in scanBootLayer did.
      const resolveStoredSchedule: Effect.Effect<ScanScheduleValue> =
        Effect.gen(function* () {
          const stored = yield* Effect.promise(() =>
            getSetting(scanScheduleSettingKey, database)
          )

          if (stored === null) {
            return defaultScanSchedule
          }

          if (isScanScheduleValue(stored)) {
            return stored
          }

          yield* Effect.logWarning(
            `Unknown scanSchedule value "${stored}" in settings. Falling back to "off".`
          )

          return 'off' as const
        })

      yield* applySchedule(yield* resolveStoredSchedule)

      return {
        getInfo,
        updateSchedule
      }
    })
  }
) {}
