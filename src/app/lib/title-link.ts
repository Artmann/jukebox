import type { ContinueWatchingItem, UpNextItem } from '../../api/contract'
import type { MediaItem } from './media'

/**
 * Where clicking a title in a row or grid should go. Titles the viewer is
 * already watching open the player directly; everything else opens the
 * title's landing page.
 */
export function resolveTitleLink(
  mediaItem: MediaItem,
  continueWatching: ReadonlyArray<ContinueWatchingItem>,
  upNext: ReadonlyArray<UpNextItem>
): string {
  if (mediaItem.type === 'movie') {
    const isInProgress = continueWatching.some(
      (entry) => entry.type === 'movie' && entry.movie.id === mediaItem.item.id
    )

    return isInProgress
      ? `/watch/${mediaItem.item.id}`
      : `/movies/${mediaItem.item.id}`
  }

  const showId = mediaItem.item.id
  const inProgressEpisode = continueWatching.find(
    (entry) => entry.type === 'episode' && entry.show.id === showId
  )

  if (inProgressEpisode?.type === 'episode') {
    return `/watch/episode/${inProgressEpisode.episode.id}`
  }

  const nextEpisode = upNext.find((entry) => entry.show.id === showId)

  if (nextEpisode) {
    return `/watch/episode/${nextEpisode.episode.id}`
  }

  return `/shows/${showId}`
}
