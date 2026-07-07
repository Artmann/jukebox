// @vitest-environment node
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import { fileURLToPath } from 'url'

import * as schema from './schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../../drizzle-telemetry')

export type TelemetryTestDatabase =
  ReturnType<typeof createTelemetryTestDatabase>['db']

// An in-memory telemetry database with the real drizzle-telemetry migrations
// applied. Tests provide it via `telemetryDatabaseTestLayer(db)` — the repo rule
// is to never mock the database, only swap in an in-memory instance.
export function createTelemetryTestDatabase() {
  const sqlite = new Database(':memory:')

  const db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder })

  return { db, schema, sqlite }
}
