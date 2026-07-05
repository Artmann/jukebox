import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export const setupStatusQueryKey = ['setupStatus'] as const

export function useSetupStatus() {
  return useQuery({
    queryKey: setupStatusQueryKey,
    queryFn: () => api((client) => client.setup.getStatus())
  })
}
