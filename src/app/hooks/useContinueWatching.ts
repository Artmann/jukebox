import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export type {
  ContinueWatchingEpisodeItem,
  ContinueWatchingItem,
  ContinueWatchingMovieItem
} from '../../api/contract'

export function useContinueWatching() {
  return useQuery({
    queryKey: ['continue-watching'],
    queryFn: () => api((client) => client.progress.listContinueWatching())
  })
}
