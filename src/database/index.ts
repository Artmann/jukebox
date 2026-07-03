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
    // Loaded only under Bun so vitest (Node) never resolves `bun:sqlite`.
    const { createBunDatabase } = await import('./bun-database')
    return createBunDatabase(migrationsFolder)
  }

  const [{ default: NodeDatabase }, { drizzle }, { migrate }] =
    await Promise.all([
      import('better-sqlite3'),
      import('drizzle-orm/better-sqlite3'),
      import('drizzle-orm/better-sqlite3/migrator')
    ])

  const sqlite = new NodeDatabase(databasePath)

  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder })

  return db as unknown as Database
}

export const db = await createDatabase()
export { schema }
