import { useQuery } from '@tanstack/react-query'

import type { ShowWithSeasons } from '../lib/media'

async function fetchShow(id: string): Promise<ShowWithSeasons> {
  const response = await fetch(`/api/library/shows/${id}`)
  if (!response.ok) throw new Error('Failed to fetch show')
  return (await response.json()) as ShowWithSeasons
}

export function useShow(id: string | undefined) {
  return useQuery({
    queryKey: ['show', id],
    queryFn: () => fetchShow(id ?? ''),
    enabled: !!id
  })
}
