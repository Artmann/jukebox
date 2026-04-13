import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

const sqlite = new Database('jukebox.db')
const db = drizzle(sqlite)

console.log('Running migrations...')

migrate(db, { migrationsFolder: './drizzle' })

console.log('Migrations complete.')
