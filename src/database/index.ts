import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import { databasePath, ensureConfigDirectory } from '../config'
import { getMigrationsDirectory } from '../runtime-paths'
import * as schema from './schema'

declare const Bun: unknown

ensureConfigDirectory()

type Schema = typeof schema
type Database = BaseSQLiteDatabase<'sync', unknown, Schema>

// Bun ships a native sqlite binding (`bun:sqlite`) that works inside a
// `bun build --compile` executable, where `better-sqlite3` cannot be loaded
// because the `bindings` package walks the filesystem looking for a
// package.json that doesn't exist inside the bundled `$bunfs`. We pick the
// driver at runtime so the same code works under Node and under a compiled
// Bun executable.
async function createDatabase(): Promise<Database> {
  const migrationsFolder = getMigrationsDirectory()

  if (typeof Bun !== 'undefined') {
    // Only the `bun:sqlite` specifier is obscured behind a variable, so
    // vite's static resolver (used by vitest in Node) doesn't try to resolve
    // the `bun:` protocol — which only exists inside the Bun runtime — at
    // module-graph build time. It's a Bun builtin, so the runtime resolves it
    // even from a fully dynamic import. The drizzle driver modules MUST stay
    // literal: `bun build --compile` only bundles imports it can see
    // statically, and the shipped release archive has no node_modules to
    // fall back on (hiding these behind variables shipped broken
    // executables — see issue #32).
    const bunSqliteModule = 'bun:sqlite'

    const { Database: BunDatabase } = (await import(bunSqliteModule)) as {
      Database: new (path: string) => { exec: (sql: string) => void }
    }
    const { drizzle } = (await import('drizzle-orm/bun-sqlite')) as {
      drizzle: (sqlite: unknown, options: { schema: Schema }) => Database
    }
    const { migrate } = (await import('drizzle-orm/bun-sqlite/migrator')) as {
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

  const { default: NodeDatabase } = await import('better-sqlite3')
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')

  const sqlite = new NodeDatabase(databasePath)

  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder })

  return db as unknown as Database
}

export const db = await createDatabase()
export { schema }
