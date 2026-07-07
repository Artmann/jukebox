import { Effect, Ref } from 'effect'

import { Database } from '../database/layer'
import { getSetting, setSetting } from '../services/settings'

export const telemetryMaxTracesKey = 'telemetry.maxTraces'
export const telemetryRetentionDaysKey = 'telemetry.retentionDays'

export interface TelemetryConfig {
  maxTraces: number
  retentionDays: number
}

export const defaultTelemetryConfig: TelemetryConfig = {
  maxTraces: 5000,
  retentionDays: 7
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

// Live tracing configuration, seeded from the main DB `settings` table at boot
// and mirrored into a Ref so the writer and retention read the current values
// without a database round-trip. Settings live in the main DB (not the telemetry
// DB) so they stay readable and writable even when the telemetry DB is empty.
export class TelemetrySettings extends Effect.Service<TelemetrySettings>()(
  'jukebox/TelemetrySettings',
  {
    effect: Effect.gen(function* () {
      const database = yield* Database

      const [retentionRaw, maxTracesRaw] = yield* Effect.promise(() =>
        Promise.all([
          getSetting(telemetryRetentionDaysKey, database),
          getSetting(telemetryMaxTracesKey, database)
        ])
      )

      const initial: TelemetryConfig = {
        maxTraces: parsePositiveInteger(
          maxTracesRaw,
          defaultTelemetryConfig.maxTraces
        ),
        retentionDays: parsePositiveInteger(
          retentionRaw,
          defaultTelemetryConfig.retentionDays
        )
      }

      const configRef = yield* Ref.make(initial)

      const current: Effect.Effect<TelemetryConfig> = Ref.get(configRef)

      const update = (
        patch: Partial<TelemetryConfig>
      ): Effect.Effect<TelemetryConfig> =>
        Effect.gen(function* () {
          const previous = yield* Ref.get(configRef)
          const next: TelemetryConfig = { ...previous, ...patch }

          yield* Ref.set(configRef, next)

          const writes: Promise<void>[] = []

          if (patch.maxTraces !== undefined) {
            writes.push(
              setSetting(
                telemetryMaxTracesKey,
                String(next.maxTraces),
                database
              )
            )
          }

          if (patch.retentionDays !== undefined) {
            writes.push(
              setSetting(
                telemetryRetentionDaysKey,
                String(next.retentionDays),
                database
              )
            )
          }

          yield* Effect.promise(() => Promise.all(writes))

          return next
        })

      return { current, update } as const
    })
  }
) {}
