import { useQuery } from '@tanstack/react-query'

import type { NextEpisodeResponse } from '../../api/contract'
import { api, ApiError } from '../lib/api-client'

export type { NextEpisodeResponse } from '../../api/contract'

async function fetchNextEpisode(
  showId: number,
  afterEpisodeId: number
): Promise<NextEpisodeResponse | null> {
  try {
    return await api((client) =>
      client.shows.getNextEpisode({
        path: { showId },
        urlParams: { afterEpisodeId }
      })
    )
  } catch (error) {
    // No next episode is a normal outcome, not a failure.
    if (error instanceof ApiError && error.status === 404) {
      return null
    }

    throw error
  }
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
