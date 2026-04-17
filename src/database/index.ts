import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'url'
import path from 'path'

import { databasePath, ensureConfigDirectory } from '../config'
import * as schema from './schema'

ensureConfigDirectory()

const sqlite = new Database(databasePath)

// SQLite disables foreign key enforcement by default, so cascades on references
// in the schema are silently ignored until this pragma is turned on per
// connection. Enable it here so every query that flows through Drizzle honors
// ON DELETE CASCADE (and rejects dangling references).
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../../drizzle')

migrate(db, { migrationsFolder })

export { schema }
