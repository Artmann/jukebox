import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export function useShows() {
  return useQuery({
    queryKey: ['shows'],
    queryFn: () => api((client) => client.shows.listShows())
  })
}
