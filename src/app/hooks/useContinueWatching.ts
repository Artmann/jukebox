import { useQuery } from '@tanstack/react-query'

import type { Movie } from './useMovies'

export interface ContinueWatchingItem {
  currentTime: number
  duration: number | null
  movie: Movie
  updatedAt: number
}

export function useContinueWatching() {
  return useQuery({
    queryKey: ['continue-watching'],
    queryFn: async (): Promise<ContinueWatchingItem[]> => {
      const response = await fetch('/api/progress/continue-watching')

      return (await response.json()) as ContinueWatchingItem[]
    }
  })
}
