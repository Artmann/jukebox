import { lt, sql } from 'drizzle-orm'
import { Clock, Duration, Effect } from 'effect'

import { TelemetryDatabase } from './layer'
import { errors, spans } from './schema'
import { TelemetrySettings } from './settings'

const millisecondsPerDay = 24 * 60 * 60 * 1000
const purgeInterval = Duration.hours(1)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Trims the telemetry database on a timer: drops spans and errors older than the
// configured retention window (the time cap) and, separately, keeps only the
// newest N distinct traces (the count cap). Modeled on the scan Scheduler: a
// fiber forked into the service scope that runs once at boot then hourly, and
// dies with the layer on shutdown.
export class TelemetryRetention extends Effect.Service<TelemetryRetention>()(
  'jukebox/TelemetryRetention',
  {
    scoped: Effect.gen(function* () {
      const database = yield* TelemetryDatabase
      const settings = yield* TelemetrySettings

      const purge: Effect.Effect<void> = Effect.gen(function* () {
        const config = yield* settings.current
        const now = yield* Clock.currentTimeMillis
        const cutoff = now - config.retentionDays * millisecondsPerDay

        yield* Effect.try({
          try: () => {
            // Time cap.
            database.delete(spans).where(lt(spans.createdAt, cutoff)).run()
            database.delete(errors).where(lt(errors.createdAt, cutoff)).run()

            // Count cap: keep spans belonging to the newest `maxTraces` traces,
            // ranked by each trace's most recent span.
            database.run(
              sql`delete from ${spans} where ${spans.traceId} not in (select ${spans.traceId} from ${spans} group by ${spans.traceId} order by max(${spans.createdAt}) desc limit ${config.maxTraces})`
            )
          },
          catch: (error) => error
        }).pipe(
          Effect.catchAll((error) =>
            Effect.logError(
              `Telemetry retention purge failed: ${errorMessage(error)}`
            )
          )
        )
      })

      yield* purge.pipe(
        Effect.andThen(Effect.sleep(purgeInterval)),
        Effect.forever,
        Effect.forkScoped
      )

      return {}
    })
  }
) {}
