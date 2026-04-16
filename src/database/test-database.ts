// @vitest-environment node
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import { fileURLToPath } from 'url'

import * as schema from './schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../../drizzle')

export type TestDatabase = ReturnType<typeof createTestDatabase>['db']

export function createTestDatabase() {
  const sqlite = new Database(':memory:')

  // Mirror the production connection setup so cascade deletes and other FK
  // behaviors are exercised by tests the same way they behave at runtime.
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder })

  return { db, sqlite, schema }
}
