import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'url'
import path from 'path'

import { databasePath, ensureConfigDirectory } from '../config'
import * as schema from './schema'

ensureConfigDirectory()

const sqlite = new Database(databasePath)

export const db = drizzle(sqlite, { schema })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../../drizzle')

migrate(db, { migrationsFolder })

export { schema }
