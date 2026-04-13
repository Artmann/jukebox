import { useQuery } from '@tanstack/react-query'

import type { Movie } from './useMovies'
import type { Episode, Show } from '../lib/media'

export interface ContinueWatchingMovieItem {
  type: 'movie'
  currentTime: number
  duration: number | null
  movie: Movie
  updatedAt: string
}

export interface ContinueWatchingEpisodeItem {
  type: 'episode'
  currentTime: number
  duration: number | null
  episode: Episode
  show: Show
  updatedAt: string
}

export type ContinueWatchingItem =
  | ContinueWatchingMovieItem
  | ContinueWatchingEpisodeItem

async function fetchContinueWatching(): Promise<ContinueWatchingItem[]> {
  const response = await fetch('/api/progress/continue-watching')
  if (!response.ok) throw new Error('Failed to fetch continue watching')
  return (await response.json()) as ContinueWatchingItem[]
}

export function useContinueWatching() {
  return useQuery({
    queryKey: ['continue-watching'],
    queryFn: fetchContinueWatching
  })
}
