import { useEffect, useReducer } from 'react'
import type Player from 'video.js/dist/types/player'

export interface PlaybackState {
  buffered: number
  isPlaying: boolean
  progress: number
  remainingTime: number
}

type PlaybackAction =
  | { type: 'buffered-changed'; buffered: number }
  | { type: 'playing-changed'; isPlaying: boolean }
  | { type: 'time-updated'; progress: number; remainingTime: number }

const initialPlaybackState: PlaybackState = {
  buffered: 0,
  isPlaying: false,
  progress: 0,
  remainingTime: 0
}

function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case 'buffered-changed':
      return { ...state, buffered: action.buffered }
    case 'playing-changed':
      return { ...state, isPlaying: action.isPlaying }
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
 */
export function usePlaybackState(player: Player | null): PlaybackState {
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState)

  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const onPlay = () => dispatch({ type: 'playing-changed', isPlaying: true })
    const onPause = () =>
      dispatch({ type: 'playing-changed', isPlaying: false })

    const onTimeUpdate = () => {
      const currentTime = player.currentTime() ?? 0
      const duration = player.duration() ?? 0

      if (duration > 0) {
        dispatch({
          type: 'time-updated',
          progress: currentTime / duration,
          remainingTime: duration - currentTime
        })
      }
    }

    const onProgress = () => {
      const bufferedRanges = player.buffered() as TimeRanges | null
      const duration = player.duration() ?? 0

      if (bufferedRanges && bufferedRanges.length > 0 && duration > 0) {
        const bufferedEnd = bufferedRanges.end(bufferedRanges.length - 1)

        dispatch({ type: 'buffered-changed', buffered: bufferedEnd / duration })
      }
    }

    player.on('play', onPlay)
    player.on('pause', onPause)
    player.on('timeupdate', onTimeUpdate)
    player.on('progress', onProgress)

    dispatch({ type: 'playing-changed', isPlaying: !player.paused() })

    return () => {
      if (player.isDisposed()) {
        return
      }

      player.off('play', onPlay)
      player.off('pause', onPause)
      player.off('timeupdate', onTimeUpdate)
      player.off('progress', onProgress)
    }
  }, [player])

  return state
}
