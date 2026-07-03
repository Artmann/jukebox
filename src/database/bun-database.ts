import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import { databasePath } from '../config'
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

export async function createBunDatabase(
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

  const sqlite = new BunDatabase(databasePath)

  // SQLite disables foreign key enforcement by default, so cascades on
  // references in the schema are silently ignored until this pragma is
  // turned on per connection.
  sqlite.exec('PRAGMA foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder })

  return db as unknown as Database
}
