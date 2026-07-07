import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import { telemetryDatabasePath } from './config'
import * as schema from './schema'

type Schema = typeof schema
type Database = BaseSQLiteDatabase<'sync', unknown, Schema>

interface BunSqliteConnection {
  exec: (sql: string) => void
}

type BunSqliteConstructor = new (path: string) => BunSqliteConnection

interface BunSqliteModule {
  Database: BunSqliteConstructor
}

// The Bun (`bun:sqlite`) driver for the telemetry database, kept in its own
// module — like src/database/bun-database.ts — so vitest under Node never
// resolves the `bun:sqlite` built-in. Every import specifier here is a literal
// string: a variable specifier once broke the `bun build --compile` binary.
export async function createBunTelemetryDatabase(
  migrationsFolder: string
): Promise<Database> {
  const { Database: BunDatabase } = (await import(
    // @ts-expect-error Bun built-in — only resolves when running under Bun.
    'bun:sqlite'
  )) as BunSqliteModule
  const { drizzle } = (await import('drizzle-orm/bun-sqlite')) as unknown as {
    drizzle: (sqlite: unknown, options: { schema: Schema }) => Database
  }
  const { migrate } = (await import(
    'drizzle-orm/bun-sqlite/migrator'
  )) as unknown as {
    migrate: (db: Database, config: { migrationsFolder: string }) => void
  }

  const sqlite = new BunDatabase(telemetryDatabasePath)

  // WAL lets the background writer insert while the dashboard reads without the
  // two blocking each other. There are no foreign keys in the telemetry schema
  // by design, so the two tables purge independently.
  sqlite.exec('PRAGMA journal_mode = WAL')

  const db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder })

  return db as unknown as Database
}
