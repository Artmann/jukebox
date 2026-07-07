import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import { fileURLToPath } from 'url'

import { ensureConfigDirectory } from '../../config'
import { telemetryDatabasePath } from '../config'

ensureConfigDirectory()

const sqlite = new Database(telemetryDatabasePath)
const db = drizzle(sqlite)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../../../drizzle-telemetry')

console.log('Running telemetry migrations...')

migrate(db, { migrationsFolder })

console.log('Telemetry migrations complete.')
