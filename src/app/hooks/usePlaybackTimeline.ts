import { useMemo, useRef } from 'react'
import type Player from 'video.js/dist/types/player'

import {
  createPlaybackTimeline,
  type PlaybackTimeline,
  type PlaybackTimelineState
} from '../lib/playback-timeline'

export interface UsePlaybackTimelineOptions {
  duration: number | null
  isTranscoded: boolean
  onRestart: (seconds: number) => void
  player: Player | null
  startSeconds: number
}

/**
 * The one object every part of the watch page reads and sets time through.
 * Its identity never changes, so consumers can keep it in effect dependencies
 * without re-subscribing every time the offset or the player changes — the
 * methods read the latest values instead.
 */
export function usePlaybackTimeline({
  duration,
  isTranscoded,
  onRestart,
  player,
  startSeconds
}: UsePlaybackTimelineOptions): PlaybackTimeline {
  const stateRef = useRef<PlaybackTimelineState>({
    duration,
    isTranscoded,
    onRestart,
    player,
    startSeconds
  })

  stateRef.current = { duration, isTranscoded, onRestart, player, startSeconds }

  return useMemo(() => createPlaybackTimeline(() => stateRef.current), [])
}
