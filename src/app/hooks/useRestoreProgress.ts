import { useEffect, useRef } from 'react'

import { watchedThreshold } from '../../lib/watched'
import type { PlaybackTimeline } from '../lib/playback-timeline'
import type { WatchProgress } from './useWatchData'

export interface RestoreProgressOptions {
  // Whether the player knows yet how this file plays. Restoring before that
  // would hand a transcoded resume position to a plain seek, and a live HLS
  // playlist silently snaps those back to its start.
  isSourceReady: boolean
  mediaKey: string | null
  savedProgress: WatchProgress | undefined
  timeline: PlaybackTimeline
}

/**
 * Seeks to the saved position once per media item. If the saved progress
 * indicates the media was already finished, playback starts from the
 * beginning instead so re-watching a completed episode doesn't drop the
 * viewer straight into the credits.
 */
export function useRestoreProgress({
  isSourceReady,
  mediaKey,
  savedProgress,
  timeline
}: RestoreProgressOptions): void {
  // Remembers which media item progress was restored for, so refetches of the
  // same progress don't re-seek, while a new episode or movie restores fresh.
  const restoredForRef = useRef<string | null>(null)

  useEffect(() => {
    if (
      !isSourceReady ||
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

    timeline.seek(currentTime)
  }, [isSourceReady, mediaKey, savedProgress, timeline])
}
