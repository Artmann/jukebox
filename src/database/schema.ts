import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const movies = sqliteTable('movies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size'),
  extension: text('extension'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  // TMDB metadata
  tmdbId: integer('tmdb_id'),
  year: integer('year'),
  overview: text('overview'),
  runtime: integer('runtime'),
  genres: text('genres'),
  rating: real('rating'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  trailerUrl: text('trailer_url')
})

export const watchProgress = sqliteTable('watch_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  movieId: integer('movie_id').notNull().references(() => movies.id),
  currentTime: integer('current_time').notNull(),
  duration: integer('duration'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export type Movie = typeof movies.$inferSelect
export type NewMovie = typeof movies.$inferInsert
export type WatchProgress = typeof watchProgress.$inferSelect
export type NewWatchProgress = typeof watchProgress.$inferInsert
