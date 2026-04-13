import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'url'
import path from 'path'

import { databasePath, ensureConfigDirectory } from '../config'

ensureConfigDirectory()

const sqlite = new Database(databasePath)
const db = drizzle(sqlite)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../../drizzle')

console.log('Running migrations...')

migrate(db, { migrationsFolder })

console.log('Migrations complete.')
