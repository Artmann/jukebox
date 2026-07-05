import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export function useShow(id: string | undefined) {
  return useQuery({
    queryKey: ['show', id],
    queryFn: () =>
      api((client) => client.shows.getShow({ path: { id: Number(id) } })),
    enabled: !!id
  })
}
