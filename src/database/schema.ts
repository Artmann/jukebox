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

export const shows = sqliteTable('shows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  folderPath: text('folder_path').notNull().unique(),
  tmdbId: integer('tmdb_id'),
  year: integer('year'),
  overview: text('overview'),
  genres: text('genres'),
  rating: real('rating'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const seasons = sqliteTable('seasons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  showId: integer('show_id')
    .notNull()
    .references(() => shows.id),
  seasonNumber: integer('season_number').notNull(),
  name: text('name'),
  overview: text('overview'),
  posterPath: text('poster_path'),
  episodeCount: integer('episode_count')
})

export const episodes = sqliteTable('episodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  showId: integer('show_id')
    .notNull()
    .references(() => shows.id),
  seasonId: integer('season_id')
    .notNull()
    .references(() => seasons.id),
  seasonNumber: integer('season_number').notNull(),
  episodeNumber: integer('episode_number').notNull(),
  title: text('title').notNull(),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size'),
  extension: text('extension'),
  tmdbId: integer('tmdb_id'),
  overview: text('overview'),
  runtime: integer('runtime'),
  stillPath: text('still_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const watchProgress = sqliteTable('watch_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  movieId: integer('movie_id').references(() => movies.id),
  episodeId: integer('episode_id').references(() => episodes.id),
  currentTime: integer('current_time').notNull(),
  duration: integer('duration'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export type Movie = typeof movies.$inferSelect
export type NewMovie = typeof movies.$inferInsert
export type Episode = typeof episodes.$inferSelect
export type NewEpisode = typeof episodes.$inferInsert
export type Season = typeof seasons.$inferSelect
export type NewSeason = typeof seasons.$inferInsert
export type Show = typeof shows.$inferSelect
export type NewShow = typeof shows.$inferInsert
export type WatchProgress = typeof watchProgress.$inferSelect
export type NewWatchProgress = typeof watchProgress.$inferInsert
