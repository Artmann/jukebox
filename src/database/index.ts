import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import { databasePath, ensureConfigDirectory } from '../config'
import * as schema from './schema'

ensureConfigDirectory()

const sqlite = new Database(databasePath)

export const db = drizzle(sqlite, { schema })

migrate(db, { migrationsFolder: './drizzle' })

export { schema }
