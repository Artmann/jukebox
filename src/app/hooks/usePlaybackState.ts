import { useEffect, useReducer } from 'react'
import type Player from 'video.js/dist/types/player'

import { bufferedEndAt, type PlaybackTimeline } from '../lib/playback-timeline'

export interface PlaybackState {
  buffered: number
  isPlaying: boolean
  progress: number
  // How far playback can jump to right now, as a fraction of the file. Below
  // 1 only while a transcode is still catching up.
  reachable: number
  remainingTime: number
}

type PlaybackAction =
  | { type: 'playing-changed'; isPlaying: boolean }
  | { type: 'ranges-changed'; buffered: number; reachable: number }
  | { type: 'time-updated'; progress: number; remainingTime: number }

const initialPlaybackState: PlaybackState = {
  buffered: 0,
  isPlaying: false,
  progress: 0,
  reachable: 0,
  remainingTime: 0
}

function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case 'playing-changed':
      return { ...state, isPlaying: action.isPlaying }
    case 'ranges-changed':
      if (
        state.buffered === action.buffered &&
        state.reachable === action.reachable
      ) {
        return state
      }

      return { ...state, buffered: action.buffered, reachable: action.reachable }
    case 'time-updated':
      return {
        ...state,
        progress: action.progress,
        remainingTime: action.remainingTime
      }
  }
}

/**
 * Tracks playback progress, buffering, and play state from video.js events
 * as one reducer-managed snapshot instead of separate cascading setters.
 *
 * Every position comes from the timeline, so a transcode session that starts
 * mid-file still reports where the viewer actually is in the file rather than
 * where they are in the session.
 */
export function usePlaybackState(
  player: Player | null,
  timeline: PlaybackTimeline
): PlaybackState {
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState)

  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const onPlay = () => dispatch({ type: 'playing-changed', isPlaying: true })
    const onPause = () =>
      dispatch({ type: 'playing-changed', isPlaying: false })

    const updateRanges = () => {
      const duration = timeline.duration()

      if (duration <= 0) {
        return
      }

      // The range holding the playhead, not the last one: after a seek an
      // older range can still sit ahead of it and would overstate buffering.
      const bufferedEnd =
        timeline.startSeconds() +
        bufferedEndAt(player, player.currentTime() ?? 0)

      dispatch({
        type: 'ranges-changed',
        buffered: bufferedEnd / duration,
        reachable: timeline.reachableEnd() / duration
      })
    }

    const onTimeUpdate = () => {
      const currentTime = timeline.currentTime()
      const duration = timeline.duration()

      if (duration > 0) {
        dispatch({
          type: 'time-updated',
          progress: currentTime / duration,
          remainingTime: duration - currentTime
        })
      }

      updateRanges()
    }

    player.on('play', onPlay)
    player.on('pause', onPause)
    player.on('timeupdate', onTimeUpdate)
    player.on('progress', updateRanges)

    dispatch({ type: 'playing-changed', isPlaying: !player.paused() })

    return () => {
      if (player.isDisposed()) {
        return
      }

      player.off('play', onPlay)
      player.off('pause', onPause)
      player.off('timeupdate', onTimeUpdate)
      player.off('progress', updateRanges)
    }
  }, [player, timeline])

  return state
}
