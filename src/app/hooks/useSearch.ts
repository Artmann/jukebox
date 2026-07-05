import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export type {
  SearchEpisodeResult as SearchEpisode,
  SearchMovieResult as SearchMovie,
  SearchResult as SearchResults,
  SearchShowResult as SearchShow
} from '../../api/contract'

export function useSearch(query: string) {
  return useQuery({
    enabled: query.trim().length > 0,
    queryKey: ['search', query],
    queryFn: () => api((client) => client.search.search({ urlParams: { q: query } })),
    staleTime: 30_000
  })
}
