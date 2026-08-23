import { useCallback, useEffect, useRef, useState } from 'react'

const hideDelayMs = 3000

interface ControlsAutoHideResult {
  controlsVisible: boolean
  showControls: () => void
}

/**
 * Auto-hides the player controls after a few seconds of playback. While
 * paused the controls stay visible. Wire `showControls` to mouse movement
 * and hotkeys so any interaction reveals them and restarts the hide timer.
 */
export function useControlsAutoHide(
  isPlaying: boolean
): ControlsAutoHideResult {
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showControls = useCallback(() => {
    setControlsVisible(true)

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }

    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, hideDelayMs)
    }
  }, [isPlaying])

  // When paused, always show controls. When playing, start the hide timer.
  useEffect(() => {
    setControlsVisible(true)

    if (!isPlaying) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }

      return
    }

    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, hideDelayMs)

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [isPlaying])

  return { controlsVisible, showControls }
}
