// @vitest-environment node
import { it } from '@effect/vitest'
import { Duration, Effect, Layer, Ref, Stream, TestClock } from 'effect'
import { beforeEach, describe, expect } from 'vitest'

import { databaseTestLayer } from '../database/layer'
import { createTestDatabase } from '../database/test-database'
import { ScanManager } from './scan-manager'
import { Scheduler, scheduleIntervalMilliseconds } from './scheduler'
import { scanScheduleSettingKey, setSetting } from './settings'
import type { ScanScheduleValue } from './settings'

const testDb = createTestDatabase()

const sixHours = 6 * 60 * 60 * 1000

interface FakeManager {
  layer: Layer.Layer<ScanManager>
  startCount: Ref.Ref<number>
  running: Ref.Ref<boolean>
}

// A ScanManager whose start just counts its calls, so the scheduler's timer
// behaviour can be observed without running a real scan. Provided in place of
// the baked-in ScanManager.Default via Scheduler.DefaultWithoutDependencies.
const makeFakeManager = Effect.gen(function* () {
  const startCount = yield* Ref.make(0)
  const running = yield* Ref.make(false)

  const value = {
    events: Stream.empty,
    getStatus: Effect.succeed({
      currentJob: null,
      isRunning: false,
      lastJob: null
    }),
    isRunning: Ref.get(running),
    recoverInterruptedJobs: Effect.void,
    start: Ref.update(startCount, (count) => count + 1).pipe(
      Effect.as({ added: 0, status: 'done' as const, total: 0, updated: 0 })
    ),
    subscribe: Effect.succeed(Stream.empty)
  } as unknown as ScanManager

  return {
    layer: Layer.succeed(ScanManager, value),
    running,
    startCount
  } satisfies FakeManager
})

const schedulerLayerFrom = (fakeManager: FakeManager) =>
  Scheduler.DefaultWithoutDependencies.pipe(
    Layer.provide(fakeManager.layer),
    Layer.provide(databaseTestLayer(testDb.db))
  )

beforeEach(() => {
  testDb.db.delete(testDb.schema.settings).run()
  testDb.db.delete(testDb.schema.scanJobs).run()
  testDb.db.delete(testDb.schema.libraries).run()
})

describe('scheduleIntervalMilliseconds', () => {
  it('returns null when schedule is off', () => {
    expect(scheduleIntervalMilliseconds('off')).toEqual(null)
  })

  it('maps 6h to 6 * 60 * 60 * 1000 ms', () => {
    expect(scheduleIntervalMilliseconds('6h')).toEqual(sixHours)
  })

  it('maps 12h to 12 * 60 * 60 * 1000 ms', () => {
    expect(scheduleIntervalMilliseconds('12h')).toEqual(12 * 60 * 60 * 1000)
  })

  it('maps 24h to 24 * 60 * 60 * 1000 ms', () => {
    expect(scheduleIntervalMilliseconds('24h')).toEqual(24 * 60 * 60 * 1000)
  })
})

describe('Scheduler', () => {
  it.effect('does not fire when the schedule is off', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        setSetting(scanScheduleSettingKey, 'off', testDb.db)
      )

      const fakeManager = yield* makeFakeManager

      yield* Effect.gen(function* () {
        yield* Scheduler
        yield* TestClock.adjust(Duration.hours(24))

        expect(yield* Ref.get(fakeManager.startCount)).toEqual(0)
      }).pipe(Effect.provide(schedulerLayerFrom(fakeManager)))
    })
  )

  it.effect('fires the scan every interval when the schedule is 6h', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        setSetting(scanScheduleSettingKey, '6h', testDb.db)
      )

      const fakeManager = yield* makeFakeManager

      yield* Effect.gen(function* () {
        yield* Scheduler

        yield* TestClock.adjust(Duration.hours(6))
        expect(yield* Ref.get(fakeManager.startCount)).toEqual(1)

        yield* TestClock.adjust(Duration.hours(6))
        expect(yield* Ref.get(fakeManager.startCount)).toEqual(2)
      }).pipe(Effect.provide(schedulerLayerFrom(fakeManager)))
    })
  )

  it.effect('skips a tick when a scan is already running', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        setSetting(scanScheduleSettingKey, '6h', testDb.db)
      )

      const fakeManager = yield* makeFakeManager

      yield* Ref.set(fakeManager.running, true)

      yield* Effect.gen(function* () {
        yield* Scheduler
        yield* TestClock.adjust(Duration.hours(6))

        expect(yield* Ref.get(fakeManager.startCount)).toEqual(0)
      }).pipe(Effect.provide(schedulerLayerFrom(fakeManager)))
    })
  )

  it.effect('updateSchedule switches the interval', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        setSetting(scanScheduleSettingKey, '24h', testDb.db)
      )

      const fakeManager = yield* makeFakeManager

      yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler

        yield* scheduler.updateSchedule('6h')
        yield* TestClock.adjust(Duration.hours(6))

        expect(yield* Ref.get(fakeManager.startCount)).toEqual(1)
      }).pipe(Effect.provide(schedulerLayerFrom(fakeManager)))
    })
  )

  it.effect('updateSchedule off stops future ticks', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        setSetting(scanScheduleSettingKey, '6h', testDb.db)
      )

      const fakeManager = yield* makeFakeManager

      yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler

        yield* scheduler.updateSchedule('off')
        yield* TestClock.adjust(Duration.hours(24))

        expect(yield* Ref.get(fakeManager.startCount)).toEqual(0)
      }).pipe(Effect.provide(schedulerLayerFrom(fakeManager)))
    })
  )

  it.effect('reports the next-run timestamp for an active schedule', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        setSetting(scanScheduleSettingKey, '6h', testDb.db)
      )

      const fakeManager = yield* makeFakeManager

      yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler
        const info = yield* scheduler.getInfo

        expect(info.schedule).toEqual('6h' satisfies ScanScheduleValue)
        expect(info.nextRunAt).not.toEqual(null)
        // TestClock's epoch is 0, so the first run is armed exactly one
        // interval in.
        expect(info.nextRunAt?.getTime()).toEqual(sixHours)
      }).pipe(Effect.provide(schedulerLayerFrom(fakeManager)))
    })
  )

  it.effect('reports a null nextRunAt when the schedule is off', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        setSetting(scanScheduleSettingKey, 'off', testDb.db)
      )

      const fakeManager = yield* makeFakeManager

      yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler
        const info = yield* scheduler.getInfo

        expect(info).toEqual({ nextRunAt: null, schedule: 'off' })
      }).pipe(Effect.provide(schedulerLayerFrom(fakeManager)))
    })
  )
})
