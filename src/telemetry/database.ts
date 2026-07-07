import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import { ensureConfigDirectory } from '../config'
import { getTelemetryMigrationsDirectory } from '../runtime-paths'

import { telemetryDatabasePath } from './config'
import * as schema from './schema'

declare const Bun: unknown

type Schema = typeof schema
export type TelemetryDrizzleDatabase = BaseSQLiteDatabase<'sync', unknown, Schema>

// Opens (creating if needed) the telemetry SQLite database and runs its
// migrations. Mirrors src/database/index.ts, but points at telemetry.db and the
// drizzle-telemetry migrations, and is exposed as a factory rather than a
// top-level-await singleton: nothing imports the telemetry connection directly,
// so the Effect layer builds it cleanly (see src/telemetry/layer.ts).
//
// The driver is chosen at runtime — `bun:sqlite` under a compiled Bun binary
// (where better-sqlite3 cannot load), better-sqlite3 under Node. Every import
// specifier is a literal string for the same reason.
export async function createTelemetryDatabase(): Promise<TelemetryDrizzleDatabase> {
  ensureConfigDirectory()

  const migrationsFolder = getTelemetryMigrationsDirectory()

  if (typeof Bun !== 'undefined') {
    const { createBunTelemetryDatabase } = await import('./bun-database')

    return createBunTelemetryDatabase(migrationsFolder)
  }

  const [{ default: NodeDatabase }, { drizzle }, { migrate }] =
    await Promise.all([
      import('better-sqlite3'),
      import('drizzle-orm/better-sqlite3'),
      import('drizzle-orm/better-sqlite3/migrator')
    ])

  const sqlite = new NodeDatabase(telemetryDatabasePath)

  // WAL lets the background writer insert while the dashboard reads without the
  // two blocking each other.
  sqlite.pragma('journal_mode = WAL')

  const db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder })

  return db as unknown as TelemetryDrizzleDatabase
}
