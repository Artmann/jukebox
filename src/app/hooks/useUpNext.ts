import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export type { UpNextItem } from '../../api/contract'

export function useUpNext() {
  return useQuery({
    queryKey: ['up-next'],
    queryFn: () => api((client) => client.upNext.listUpNext())
  })
}
