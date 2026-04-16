import { useQuery } from '@tanstack/react-query'

import type { Episode, Show } from '../lib/media'

export interface NextEpisodeResponse {
  episode: Episode
  show: Show
}

async function fetchNextEpisode(
  showId: number,
  afterEpisodeId: number
): Promise<NextEpisodeResponse | null> {
  const response = await fetch(
    `/api/library/shows/${showId}/next-episode?afterEpisodeId=${afterEpisodeId}`
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Failed to fetch next episode')
  }

  return (await response.json()) as NextEpisodeResponse
}

interface UseNextEpisodeOptions {
  enabled?: boolean
}

export function useNextEpisode(
  showId: number | undefined,
  afterEpisodeId: number | undefined,
  options: UseNextEpisodeOptions = {}
) {
  const enabled = (options.enabled ?? true) && !!showId && !!afterEpisodeId

  return useQuery({
    queryKey: ['next-episode', showId, afterEpisodeId],
    queryFn: () => fetchNextEpisode(showId ?? 0, afterEpisodeId ?? 0),
    enabled,
    retry: false
  })
}
