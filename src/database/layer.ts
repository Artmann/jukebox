import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { Context, Layer } from 'effect'

import { db } from './index'
import type * as schema from './schema'

export type DrizzleDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>

// The Effect service tag for the drizzle database. Handlers and services depend
// on this instead of importing the singleton directly, so tests can swap in an
// in-memory database via `databaseTestLayer`.
export class Database extends Context.Tag('jukebox/Database')<
  Database,
  DrizzleDatabase
>() {}

// Provide the existing top-level-await singleton from `./index` so the
// migration does not open a second SQLite connection. Phase 5 flips this to
// `Layer.effect(Database, Effect.promise(() => createDatabase()))` once the
// singleton shim is deleted.
export const DatabaseLive = Layer.succeed(Database, db)

export const databaseTestLayer = (database: DrizzleDatabase) =>
  Layer.succeed(Database, database)
