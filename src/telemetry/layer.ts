import { Context, Effect, Layer } from 'effect'

import { createTelemetryDatabase } from './database'
import type { TelemetryDrizzleDatabase } from './database'

// The Effect service tag for the telemetry drizzle database. The writer,
// retention, and query handlers depend on this instead of importing a singleton
// so tests can swap in an in-memory database via `telemetryDatabaseTestLayer`.
export class TelemetryDatabase extends Context.Tag('jukebox/TelemetryDatabase')<
  TelemetryDatabase,
  TelemetryDrizzleDatabase
>() {}

// Unlike the main DatabaseLive (which wraps a legacy top-level-await singleton),
// the telemetry connection is built inside the layer: it has no other importers,
// so there is no singleton to share.
export const TelemetryDatabaseLive = Layer.effect(
  TelemetryDatabase,
  Effect.promise(() => createTelemetryDatabase())
)

export const telemetryDatabaseTestLayer = (database: TelemetryDrizzleDatabase) =>
  Layer.succeed(TelemetryDatabase, database)
