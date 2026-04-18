// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createScheduler, scheduleIntervalMilliseconds } from './scheduler'
import type { ScanScheduleValue } from './settings'

describe('scheduleIntervalMilliseconds', () => {
  it('returns null when schedule is off', () => {
    expect(scheduleIntervalMilliseconds('off')).toEqual(null)
  })

  it('maps 6h to 6 * 60 * 60 * 1000 ms', () => {
    expect(scheduleIntervalMilliseconds('6h')).toEqual(6 * 60 * 60 * 1000)
  })

  it('maps 12h to 12 * 60 * 60 * 1000 ms', () => {
    expect(scheduleIntervalMilliseconds('12h')).toEqual(12 * 60 * 60 * 1000)
  })

  it('maps 24h to 24 * 60 * 60 * 1000 ms', () => {
    expect(scheduleIntervalMilliseconds('24h')).toEqual(24 * 60 * 60 * 1000)
  })
})

describe('scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeFakeScanManager() {
    const startCalls: number[] = []
    let running = false

    return {
      startCalls,
      manager: {
        isRunning: () => running,
        setRunning: (value: boolean) => {
          running = value
        },
        start: vi.fn(() => {
          startCalls.push(Date.now())

          return Promise.resolve({
            added: 0,
            status: 'done' as const,
            total: 0,
            updated: 0
          })
        })
      }
    }
  }

  it('does not schedule anything when schedule is off', async () => {
    const { manager } = makeFakeScanManager()
    const scheduler = createScheduler({
      getSchedule: () => Promise.resolve('off' as const),
      scanManager: {
        isRunning: manager.isRunning,
        start: manager.start
      }
    })

    await scheduler.start()

    vi.advanceTimersByTime(24 * 60 * 60 * 1000)

    expect(manager.start).not.toHaveBeenCalled()

    scheduler.stop()
  })

  it('fires scanManager.start() every interval when schedule is 6h', async () => {
    const { manager } = makeFakeScanManager()
    const scheduler = createScheduler({
      getSchedule: () => Promise.resolve('6h' as const),
      scanManager: {
        isRunning: manager.isRunning,
        start: manager.start
      }
    })

    await scheduler.start()

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)

    expect(manager.start).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)

    expect(manager.start).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('skips a tick when a scan is already running', async () => {
    const { manager } = makeFakeScanManager()
    manager.setRunning(true)

    const scheduler = createScheduler({
      getSchedule: () => Promise.resolve('6h' as const),
      scanManager: {
        isRunning: manager.isRunning,
        start: manager.start
      }
    })

    await scheduler.start()

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)

    expect(manager.start).not.toHaveBeenCalled()

    scheduler.stop()
  })

  it('updateSchedule switches the interval', async () => {
    const { manager } = makeFakeScanManager()
    const scheduler = createScheduler({
      getSchedule: () => Promise.resolve('24h' as const),
      scanManager: {
        isRunning: manager.isRunning,
        start: manager.start
      }
    })

    await scheduler.start()

    scheduler.updateSchedule('6h')

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)

    expect(manager.start).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it('updateSchedule off stops future ticks', async () => {
    const { manager } = makeFakeScanManager()
    const scheduler = createScheduler({
      getSchedule: () => Promise.resolve('6h' as const),
      scanManager: {
        isRunning: manager.isRunning,
        start: manager.start
      }
    })

    await scheduler.start()

    scheduler.updateSchedule('off')

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    expect(manager.start).not.toHaveBeenCalled()

    scheduler.stop()
  })

  it('reports next-run timestamp for an active schedule', async () => {
    const { manager } = makeFakeScanManager()
    const scheduler = createScheduler({
      getSchedule: () => Promise.resolve('6h' as const),
      scanManager: {
        isRunning: manager.isRunning,
        start: manager.start
      }
    })

    const before = Date.now()

    await scheduler.start()

    const info = scheduler.getInfo()

    expect(info.schedule).toEqual('6h' satisfies ScanScheduleValue)
    expect(info.nextRunAt).not.toEqual(null)

    if (info.nextRunAt !== null) {
      expect(info.nextRunAt.getTime()).toBeGreaterThanOrEqual(
        before + 6 * 60 * 60 * 1000 - 1
      )
    }

    scheduler.stop()
  })

  it('reports null nextRunAt when schedule is off', async () => {
    const { manager } = makeFakeScanManager()
    const scheduler = createScheduler({
      getSchedule: () => Promise.resolve('off' as const),
      scanManager: {
        isRunning: manager.isRunning,
        start: manager.start
      }
    })

    await scheduler.start()

    expect(scheduler.getInfo()).toEqual({
      schedule: 'off',
      nextRunAt: null
    })

    scheduler.stop()
  })
})
