import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export type { Movie } from '../../api/contract'

export function useMovies() {
  return useQuery({
    queryKey: ['movies'],
    queryFn: () => api((client) => client.library.listMovies())
  })
}
