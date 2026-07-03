import { useHotkeys } from 'react-hotkeys-hook'
import type Player from 'video.js/dist/types/player'

const skipSeconds = 10
const volumeStep = 0.05

/**
 * Global keyboard shortcuts for the watch page: space toggles playback,
 * left/right skip, up/down adjust volume, and any key reports activity so the
 * controls can reveal themselves.
 */
export function usePlayerHotkeys(
  player: Player | null,
  onActivity: () => void
): void {
  // Show controls on any keypress.
  useHotkeys('*', () => onActivity())

  // Play/pause with space.
  useHotkeys(
    'space',
    (event) => {
      event.preventDefault()

      if (!player) {
        return
      }

      if (player.paused()) {
        void player.play()
      } else {
        player.pause()
      }
    },
    [player]
  )

  // Skip backward/forward with arrow keys.
  useHotkeys(
    'left',
    () => {
      if (!player) {
        return
      }

      const currentTime = player.currentTime() ?? 0

      player.currentTime(Math.max(0, currentTime - skipSeconds))
    },
    [player]
  )

  useHotkeys(
    'right',
    () => {
      if (!player) {
        return
      }

      const currentTime = player.currentTime() ?? 0
      const duration = player.duration() ?? 0

      player.currentTime(Math.min(duration, currentTime + skipSeconds))
    },
    [player]
  )

  // Increase volume with the up arrow.
  useHotkeys(
    'up',
    (event) => {
      event.preventDefault()

      if (!player || player.isDisposed()) {
        return
      }

      const current = player.volume() ?? 1
      const next = Math.min(1, current + volumeStep)

      if (player.muted()) {
        player.muted(false)
      }

      player.volume(next)
    },
    [player]
  )

  // Decrease volume with the down arrow.
  useHotkeys(
    'down',
    (event) => {
      event.preventDefault()

      if (!player || player.isDisposed()) {
        return
      }

      const current = player.volume() ?? 1
      const next = Math.max(0, current - volumeStep)

      player.volume(next)
    },
    [player]
  )
}
