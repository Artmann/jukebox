import { log } from 'tiny-typescript-logger'

import {
  scanManager as defaultScanManager,
  type StartResult
} from './scan-manager'
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

interface SchedulerScanManager {
  isRunning: () => boolean
  start: () => Promise<StartResult>
}

export interface SchedulerDependencies {
  getSchedule?: () => Promise<ScanScheduleValue>
  scanManager?: SchedulerScanManager
}

export interface Scheduler {
  getInfo(): SchedulerInfo
  start(): Promise<void>
  stop(): void
  updateSchedule(value: ScanScheduleValue): void
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

async function defaultGetSchedule(): Promise<ScanScheduleValue> {
  const stored = await getSetting(scanScheduleSettingKey)

  if (stored === null) {
    return defaultScanSchedule
  }

  if (isScanScheduleValue(stored)) {
    return stored
  }

  log.warn(
    `Unknown scanSchedule value "${stored}" in settings. Falling back to "off".`
  )

  return 'off'
}

export function createScheduler(
  dependencies: SchedulerDependencies = {}
): Scheduler {
  const getSchedule = dependencies.getSchedule ?? defaultGetSchedule
  const scanManager = dependencies.scanManager ?? {
    isRunning: () => defaultScanManager.isRunning(),
    start: () => defaultScanManager.start()
  }

  let currentSchedule: ScanScheduleValue = 'off'
  let nextRunAt: Date | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function scheduleNext(intervalMs: number) {
    clearTimer()

    nextRunAt = new Date(Date.now() + intervalMs)

    timer = setTimeout(() => {
      void tick()
    }, intervalMs)
  }

  async function tick() {
    if (scanManager.isRunning()) {
      log.debug('Scheduler tick skipped — a scan is already running.')
    } else {
      try {
        const result = await scanManager.start()

        if (result.status === 'error') {
          const message =
            'errorMessage' in result && result.errorMessage
              ? `: ${result.errorMessage}`
              : '.'

          log.warn(`Scheduled scan finished with errors${message}`)
        } else if (result.status === 'no-libraries') {
          log.debug('Scheduled scan skipped — no libraries configured.')
        }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : 'Unknown error'

        log.warn(
          `Scheduled scan failed to start: ${message}. Check the scan page.`
        )
      }
    }

    // Re-check schedule after each tick so updateSchedule is honored even
    // if it happened while the scan was running.
    const activeInterval = scheduleIntervalMilliseconds(currentSchedule)

    if (activeInterval === null) {
      nextRunAt = null

      return
    }

    scheduleNext(activeInterval)
  }

  function applySchedule(value: ScanScheduleValue) {
    currentSchedule = value

    const intervalMs = scheduleIntervalMilliseconds(value)

    if (intervalMs === null) {
      clearTimer()
      nextRunAt = null
      log.info('Scan scheduler is off.')

      return
    }

    scheduleNext(intervalMs)

    log.info(
      `Next scheduled scan at ${nextRunAt?.toISOString() ?? 'unknown'} (${value}).`
    )
  }

  return {
    getInfo: () => ({ nextRunAt, schedule: currentSchedule }),

    start: async () => {
      const resolved = await getSchedule()
      applySchedule(resolved)
    },

    stop: () => {
      clearTimer()
      currentSchedule = 'off'
      nextRunAt = null
    },

    updateSchedule: (value: ScanScheduleValue) => {
      applySchedule(value)
    }
  }
}

export const scheduler = createScheduler()
