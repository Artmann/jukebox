import type { Movie } from '../hooks/useMovies'

export interface Show {
  id: number
  title: string
  folderPath: string
  tmdbId: number | null
  year: number | null
  overview: string | null
  genres: string | null
  rating: number | null
  posterPath: string | null
  backdropPath: string | null
  createdAt: string
  updatedAt: string
  seasonCount: number
  episodeCount: number
}

export interface ShowWithSeasons extends Omit<Show, 'seasonCount' | 'episodeCount'> {
  seasons: SeasonWithEpisodes[]
}

export interface SeasonWithEpisodes {
  id: number
  showId: number
  seasonNumber: number
  name: string | null
  overview: string | null
  posterPath: string | null
  episodeCount: number | null
  episodes: Episode[]
}

export interface Episode {
  id: number
  showId: number
  seasonId: number
  seasonNumber: number
  episodeNumber: number
  title: string
  filePath: string
  fileName: string
  fileSize: number | null
  extension: string | null
  tmdbId: number | null
  overview: string | null
  runtime: number | null
  stillPath: string | null
  createdAt: string
  updatedAt: string
}

export type MediaItem =
  | { type: 'movie'; item: Movie }
  | { type: 'show'; item: Show }

export function mergeMedia(movies: Movie[], shows: Show[]): MediaItem[] {
  const items: MediaItem[] = [
    ...movies.map((item) => ({ type: 'movie' as const, item })),
    ...shows.map((item) => ({ type: 'show' as const, item }))
  ]

  return items
}
