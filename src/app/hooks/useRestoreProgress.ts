import { useEffect, useRef } from 'react'
import type Player from 'video.js/dist/types/player'

import { watchedThreshold } from '../../lib/watched'
import type { WatchProgress } from './useWatchData'

/**
 * Seeks the player to the saved position once per media item. If the saved
 * progress indicates the media was already finished, playback starts from the
 * beginning instead so re-watching a completed episode doesn't drop the
 * viewer straight into the credits.
 */
export function useRestoreProgress(
  player: Player | null,
  savedProgress: WatchProgress | undefined,
  mediaKey: string | null
): void {
  // Remembers which media item progress was restored for, so refetches of the
  // same progress don't re-seek, while a new episode or movie restores fresh.
  const restoredForRef = useRef<string | null>(null)

  useEffect(() => {
    if (
      !player ||
      !savedProgress ||
      savedProgress.currentTime <= 0 ||
      !mediaKey ||
      restoredForRef.current === mediaKey
    ) {
      return
    }

    restoredForRef.current = mediaKey

    const { currentTime, duration } = savedProgress
    const isFinished =
      duration !== null &&
      duration > 0 &&
      currentTime / duration >= watchedThreshold

    if (isFinished) {
      return
    }

    player.currentTime(currentTime)
  }, [player, savedProgress, mediaKey])
}
