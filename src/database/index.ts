import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

const sqlite = new Database('jukebox.db')

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    extension TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    tmdb_id INTEGER,
    year INTEGER,
    overview TEXT,
    runtime INTEGER,
    genres TEXT,
    rating REAL,
    poster_path TEXT,
    backdrop_path TEXT
  )
`)

// Add TMDB columns to existing databases
const tmdbColumns = [
  { name: 'tmdb_id', type: 'INTEGER' },
  { name: 'year', type: 'INTEGER' },
  { name: 'overview', type: 'TEXT' },
  { name: 'runtime', type: 'INTEGER' },
  { name: 'genres', type: 'TEXT' },
  { name: 'rating', type: 'REAL' },
  { name: 'poster_path', type: 'TEXT' },
  { name: 'backdrop_path', type: 'TEXT' }
]

for (const col of tmdbColumns) {
  try {
    sqlite.exec(`ALTER TABLE movies ADD COLUMN ${col.name} ${col.type}`)
  } catch {
    // Column already exists
  }
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS watch_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER REFERENCES movies(id),
    current_time INTEGER NOT NULL,
    duration INTEGER,
    updated_at INTEGER NOT NULL
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    folder_path TEXT NOT NULL UNIQUE,
    tmdb_id INTEGER,
    year INTEGER,
    overview TEXT,
    genres TEXT,
    rating REAL,
    poster_path TEXT,
    backdrop_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id INTEGER NOT NULL REFERENCES shows(id),
    season_number INTEGER NOT NULL,
    name TEXT,
    overview TEXT,
    poster_path TEXT,
    episode_count INTEGER,
    UNIQUE(show_id, season_number)
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id INTEGER NOT NULL REFERENCES shows(id),
    season_id INTEGER NOT NULL REFERENCES seasons(id),
    season_number INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    extension TEXT,
    tmdb_id INTEGER,
    overview TEXT,
    runtime INTEGER,
    still_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

try {
  sqlite.exec('ALTER TABLE watch_progress ADD COLUMN episode_id INTEGER REFERENCES episodes(id)')
} catch {
  // Column already exists
}

export const db = drizzle(sqlite, { schema })
export { schema }
