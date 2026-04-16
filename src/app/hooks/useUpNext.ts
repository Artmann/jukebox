import { useQuery } from '@tanstack/react-query'

import type { Episode, Show } from '../lib/media'

export interface UpNextItem {
  episode: Episode
  show: Show
  lastWatchedAt: string
}

async function fetchUpNext(): Promise<UpNextItem[]> {
  const response = await fetch('/api/library/up-next')

  if (!response.ok) {
    throw new Error('Failed to fetch Up Next')
  }

  return (await response.json()) as UpNextItem[]
}

export function useUpNext() {
  return useQuery({
    queryKey: ['up-next'],
    queryFn: fetchUpNext
  })
}
