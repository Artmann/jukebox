import { readFile } from 'fs/promises'

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

const sqlite = new Database('jukebox.db')
const db = drizzle(sqlite)

console.log('Running migrations...')

try {
  migrate(db, { migrationsFolder: './drizzle' })
} catch (error) {
  const cause = error instanceof Error && 'cause' in error ? error.cause : null
  const isAlreadyExists =
    (cause instanceof Error && cause.message.includes('already exists')) ||
    (error instanceof Error && error.message.includes('already exists'))

  if (!isAlreadyExists) {
    throw error
  }

  // Database was created by manual SQL before migrations were adopted.
  // Mark all existing migrations as applied.
  console.log('Existing database detected. Marking migrations as applied...')

  const journal = JSON.parse(
    await readFile('./drizzle/meta/_journal.json', 'utf-8')
  ) as { entries: { tag: string; when: number }[] }

  for (const entry of journal.entries) {
    sqlite.exec(
      `INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES ('${entry.tag}', ${entry.when})`
    )
  }

  console.log(`Marked ${journal.entries.length} migrations as applied.`)
}

console.log('Migrations complete.')
