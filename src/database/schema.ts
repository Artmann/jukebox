import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  emoji: text('emoji').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

export const libraries = sqliteTable('libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  type: text('type').notNull(), // 'movies' | 'shows'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

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

export const watchProgress = sqliteTable(
  'watch_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    movieId: integer('movie_id').references(() => movies.id, {
      onDelete: 'cascade'
    }),
    episodeId: integer('episode_id').references(() => episodes.id, {
      onDelete: 'cascade'
    }),
    currentTime: integer('current_time').notNull(),
    duration: integer('duration'),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
  },
  (table) => [
    uniqueIndex('watch_progress_profile_movie_idx').on(
      table.profileId,
      table.movieId
    ),
    uniqueIndex('watch_progress_profile_episode_idx').on(
      table.profileId,
      table.episodeId
    )
  ]
)

export const favorites = sqliteTable(
  'favorites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    movieId: integer('movie_id').references(() => movies.id, {
      onDelete: 'cascade'
    }),
    showId: integer('show_id').references(() => shows.id, {
      onDelete: 'cascade'
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
  },
  (table) => [
    uniqueIndex('favorites_profile_movie_idx').on(table.profileId, table.movieId),
    uniqueIndex('favorites_profile_show_idx').on(table.profileId, table.showId)
  ]
)

export const authConfig = sqliteTable('auth_config', {
  id: integer('id').primaryKey(),
  passwordHash: text('password_hash'),
  updatedAt: integer('updated_at').notNull()
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  userAgent: text('user_agent')
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export type AuthConfig = typeof authConfig.$inferSelect
export type NewAuthConfig = typeof authConfig.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Library = typeof libraries.$inferSelect
export type NewLibrary = typeof libraries.$inferInsert
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
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Favorite = typeof favorites.$inferSelect
export type NewFavorite = typeof favorites.$inferInsert
export type Setting = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert
