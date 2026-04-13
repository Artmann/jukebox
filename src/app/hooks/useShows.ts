import { useQuery } from '@tanstack/react-query'

import type { Show } from '../lib/media'

async function fetchShows(): Promise<Show[]> {
  const response = await fetch('/api/library/shows')
  if (!response.ok) throw new Error('Failed to fetch shows')
  return (await response.json()) as Show[]
}

export function useShows() {
  return useQuery({
    queryKey: ['shows'],
    queryFn: fetchShows
  })
}
