import { Schema } from 'effect'

// Wire shapes mirror today's Hono JSON responses byte-for-byte. Drizzle Date
// columns get serialized by JSON.stringify into ISO strings, so every date
// field is Schema.String here — no Date coercion until parity is proven.

export const BrowseEntry = Schema.Struct({
  name: Schema.String,
  path: Schema.String
})

export type BrowseEntry = typeof BrowseEntry.Type

export const BrowseResponse = Schema.Struct({
  entries: Schema.Array(BrowseEntry),
  parent: Schema.NullOr(Schema.String),
  path: Schema.String,
  separator: Schema.String
})

export type BrowseResponse = typeof BrowseResponse.Type

export const Episode = Schema.Struct({
  createdAt: Schema.String,
  episodeNumber: Schema.Number,
  extension: Schema.NullOr(Schema.String),
  externalId: Schema.NullOr(Schema.String),
  fileName: Schema.String,
  filePath: Schema.String,
  fileSize: Schema.NullOr(Schema.Number),
  id: Schema.Number,
  overview: Schema.NullOr(Schema.String),
  runtime: Schema.NullOr(Schema.Number),
  seasonId: Schema.Number,
  seasonNumber: Schema.Number,
  showId: Schema.Number,
  stillUrl: Schema.NullOr(Schema.String),
  title: Schema.String,
  updatedAt: Schema.String
})

export type Episode = typeof Episode.Type

export const Movie = Schema.Struct({
  backdropUrl: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  extension: Schema.NullOr(Schema.String),
  externalId: Schema.NullOr(Schema.String),
  fileName: Schema.String,
  filePath: Schema.String,
  fileSize: Schema.NullOr(Schema.Number),
  genres: Schema.NullOr(Schema.String),
  id: Schema.Number,
  overview: Schema.NullOr(Schema.String),
  posterUrl: Schema.NullOr(Schema.String),
  rating: Schema.NullOr(Schema.Number),
  runtime: Schema.NullOr(Schema.Number),
  title: Schema.String,
  trailerUrl: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  year: Schema.NullOr(Schema.Number)
})

export type Movie = typeof Movie.Type

export const Profile = Schema.Struct({
  createdAt: Schema.String,
  emoji: Schema.String,
  id: Schema.Number,
  name: Schema.String
})

export type Profile = typeof Profile.Type

export const Season = Schema.Struct({
  episodeCount: Schema.NullOr(Schema.Number),
  id: Schema.Number,
  name: Schema.NullOr(Schema.String),
  overview: Schema.NullOr(Schema.String),
  posterUrl: Schema.NullOr(Schema.String),
  seasonNumber: Schema.Number,
  showId: Schema.Number
})

export type Season = typeof Season.Type

export const Show = Schema.Struct({
  backdropUrl: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  externalId: Schema.NullOr(Schema.String),
  folderPath: Schema.String,
  genres: Schema.NullOr(Schema.String),
  id: Schema.Number,
  overview: Schema.NullOr(Schema.String),
  posterUrl: Schema.NullOr(Schema.String),
  rating: Schema.NullOr(Schema.Number),
  title: Schema.String,
  updatedAt: Schema.String,
  year: Schema.NullOr(Schema.Number)
})

export type Show = typeof Show.Type

export const SubtitleTrack = Schema.Struct({
  displayLanguage: Schema.String,
  format: Schema.Literal('ass', 'srt', 'vtt'),
  id: Schema.Number,
  isSupported: Schema.Boolean,
  language: Schema.String
})

export type SubtitleTrack = typeof SubtitleTrack.Type

// --- Composites built from the entities above -------------------------------

export const ContinueWatchingEpisodeItem = Schema.Struct({
  currentTime: Schema.Number,
  duration: Schema.NullOr(Schema.Number),
  episode: Episode,
  show: Show,
  type: Schema.Literal('episode'),
  updatedAt: Schema.String
})

export type ContinueWatchingEpisodeItem =
  typeof ContinueWatchingEpisodeItem.Type

export const ContinueWatchingMovieItem = Schema.Struct({
  currentTime: Schema.Number,
  duration: Schema.NullOr(Schema.Number),
  movie: Movie,
  type: Schema.Literal('movie'),
  updatedAt: Schema.String
})

export type ContinueWatchingMovieItem = typeof ContinueWatchingMovieItem.Type

export const ContinueWatchingItem = Schema.Union(
  ContinueWatchingMovieItem,
  ContinueWatchingEpisodeItem
)

export type ContinueWatchingItem = typeof ContinueWatchingItem.Type

export const EpisodeWithShow = Schema.Struct({
  episode: Episode,
  show: Show,
  subtitles: Schema.Array(SubtitleTrack)
})

export type EpisodeWithShow = typeof EpisodeWithShow.Type

export const FavoriteMovieItem = Schema.Struct({
  createdAt: Schema.String,
  movie: Movie,
  type: Schema.Literal('movie')
})

export type FavoriteMovieItem = typeof FavoriteMovieItem.Type

export const FavoriteShowItem = Schema.Struct({
  createdAt: Schema.String,
  show: Show,
  type: Schema.Literal('show')
})

export type FavoriteShowItem = typeof FavoriteShowItem.Type

export const FavoriteItem = Schema.Union(FavoriteMovieItem, FavoriteShowItem)

export type FavoriteItem = typeof FavoriteItem.Type

// Libraries are serialized by the routes as this four-field projection, never
// as the full database row.
export const Library = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  path: Schema.String,
  type: Schema.Literal('movies', 'shows')
})

export type Library = typeof Library.Type

export const LibraryScanResult = Schema.Struct({
  added: Schema.Number,
  error: Schema.NullOr(Schema.String),
  libraryId: Schema.Number,
  name: Schema.String,
  status: Schema.Literal('complete', 'error'),
  total: Schema.Number,
  updated: Schema.Number
})

export type LibraryScanResult = typeof LibraryScanResult.Type

export const MovieWithSubtitles = Schema.Struct({
  ...Movie.fields,
  subtitles: Schema.Array(SubtitleTrack)
})

export type MovieWithSubtitles = typeof MovieWithSubtitles.Type

export const NextEpisodeResponse = Schema.Struct({
  episode: Episode,
  show: Show
})

export type NextEpisodeResponse = typeof NextEpisodeResponse.Type

export const ScanJobSummary = Schema.Struct({
  added: Schema.Number,
  endedAt: Schema.NullOr(Schema.String),
  errorMessage: Schema.NullOr(Schema.String),
  id: Schema.Number,
  libraries: Schema.Array(LibraryScanResult),
  startedAt: Schema.String,
  status: Schema.Literal('running', 'done', 'error'),
  total: Schema.Number,
  updated: Schema.Number
})

export type ScanJobSummary = typeof ScanJobSummary.Type

export const ScanStatus = Schema.Struct({
  currentJob: Schema.NullOr(ScanJobSummary),
  isRunning: Schema.Boolean,
  lastJob: Schema.NullOr(ScanJobSummary)
})

export type ScanStatus = typeof ScanStatus.Type

export const SearchEpisodeResult = Schema.Struct({
  episodeNumber: Schema.Number,
  id: Schema.Number,
  overview: Schema.NullOr(Schema.String),
  seasonNumber: Schema.Number,
  showId: Schema.Number,
  showTitle: Schema.String,
  stillUrl: Schema.NullOr(Schema.String),
  title: Schema.String
})

export type SearchEpisodeResult = typeof SearchEpisodeResult.Type

export const SearchMovieResult = Schema.Struct({
  backdropUrl: Schema.NullOr(Schema.String),
  id: Schema.Number,
  overview: Schema.NullOr(Schema.String),
  posterUrl: Schema.NullOr(Schema.String),
  title: Schema.String,
  year: Schema.NullOr(Schema.Number)
})

export type SearchMovieResult = typeof SearchMovieResult.Type

export const SearchShowResult = Schema.Struct({
  backdropUrl: Schema.NullOr(Schema.String),
  id: Schema.Number,
  overview: Schema.NullOr(Schema.String),
  posterUrl: Schema.NullOr(Schema.String),
  title: Schema.String,
  year: Schema.NullOr(Schema.Number)
})

export type SearchShowResult = typeof SearchShowResult.Type

export const SearchResult = Schema.Struct({
  episodes: Schema.Array(SearchEpisodeResult),
  indexEmpty: Schema.Boolean,
  movies: Schema.Array(SearchMovieResult),
  shows: Schema.Array(SearchShowResult)
})

export type SearchResult = typeof SearchResult.Type

export const SeasonWithEpisodes = Schema.Struct({
  ...Season.fields,
  episodes: Schema.Array(Episode)
})

export type SeasonWithEpisodes = typeof SeasonWithEpisodes.Type

export const ShowWithCounts = Schema.Struct({
  ...Show.fields,
  episodeCount: Schema.Number,
  seasonCount: Schema.Number
})

export type ShowWithCounts = typeof ShowWithCounts.Type

export const ShowWithSeasons = Schema.Struct({
  ...Show.fields,
  seasons: Schema.Array(SeasonWithEpisodes)
})

export type ShowWithSeasons = typeof ShowWithSeasons.Type

export const SuccessResponse = Schema.Struct({
  success: Schema.Boolean
})

export type SuccessResponse = typeof SuccessResponse.Type

export const UpNextItem = Schema.Struct({
  episode: Episode,
  lastWatchedAt: Schema.String,
  show: Show
})

export type UpNextItem = typeof UpNextItem.Type

// PUT progress bodies: `duration` is optional in today's routes and preserved
// as-is when omitted.
export const WatchProgressUpdate = Schema.Struct({
  currentTime: Schema.Number,
  duration: Schema.optional(Schema.Number)
})

export type WatchProgressUpdate = typeof WatchProgressUpdate.Type

export const WatchProgressSummary = Schema.Struct({
  currentTime: Schema.Number,
  duration: Schema.NullOr(Schema.Number)
})

export type WatchProgressSummary = typeof WatchProgressSummary.Type
