import type { Movie } from '../hooks/useMovies'

export type SubtitleFormat = 'ass' | 'srt' | 'vtt'

export interface SubtitleTrack {
  id: number
  displayLanguage: string
  format: SubtitleFormat
  isSupported: boolean
  language: string
}

export interface Show {
  id: number
  title: string
  folderPath: string
  externalId: string | null
  year: number | null
  overview: string | null
  genres: string | null
  rating: number | null
  posterUrl: string | null
  backdropUrl: string | null
  createdAt: string
  updatedAt: string
  seasonCount: number
  episodeCount: number
}

export interface ShowWithSeasons extends Omit<
  Show,
  'seasonCount' | 'episodeCount'
> {
  seasons: SeasonWithEpisodes[]
}

export interface SeasonWithEpisodes {
  id: number
  showId: number
  seasonNumber: number
  name: string | null
  overview: string | null
  posterUrl: string | null
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
  externalId: string | null
  overview: string | null
  runtime: number | null
  stillUrl: string | null
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
