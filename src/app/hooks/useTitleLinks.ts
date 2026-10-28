import { useCallback } from 'react'

import type { MediaItem } from '../lib/media'
import { resolveTitleLink } from '../lib/title-link'
import { useContinueWatching } from './useContinueWatching'
import { useUpNext } from './useUpNext'

/**
 * Links for titles in rows and grids. Titles the viewer is already watching
 * open the player; the rest open their landing page, which is also the
 * fallback while watch state is still loading.
 */
export function useTitleLinks(): (mediaItem: MediaItem) => string {
  const { data: continueWatching } = useContinueWatching()
  const { data: upNext } = useUpNext()

  return useCallback(
    (mediaItem: MediaItem) =>
      resolveTitleLink(mediaItem, continueWatching ?? [], upNext ?? []),
    [continueWatching, upNext]
  )
}
