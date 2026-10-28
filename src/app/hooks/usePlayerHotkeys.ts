import { useHotkeys } from 'react-hotkeys-hook'
import type Player from 'video.js/dist/types/player'

import type { PlaybackTimeline } from '../lib/playback-timeline'

const skipSeconds = 10
const volumeStep = 0.05

interface PlayerHotkeysOptions {
  // False while something else owns the keyboard, like the episode overlay,
  // so arrow keys and space act on it instead of on playback.
  enabled: boolean
  onActivity: () => void
}

/**
 * Global keyboard shortcuts for the watch page: space toggles playback,
 * left/right skip, up/down adjust volume, and any key reports activity so the
 * controls can reveal themselves.
 */
export function usePlayerHotkeys(
  player: Player | null,
  timeline: PlaybackTimeline,
  { enabled, onActivity }: PlayerHotkeysOptions
): void {
  // Show controls on any keypress.
  useHotkeys('*', () => onActivity(), { enabled })

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
    { enabled },
    [player]
  )

  // Skip backward/forward with arrow keys. The timeline clamps to the file's
  // bounds and restarts the transcode when the position is out of its reach.
  useHotkeys(
    'left',
    () => {
      timeline.seek(timeline.currentTime() - skipSeconds)
    },
    { enabled },
    [timeline]
  )

  useHotkeys(
    'right',
    () => {
      timeline.seek(timeline.currentTime() + skipSeconds)
    },
    { enabled },
    [timeline]
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
    { enabled },
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
    { enabled },
    [player]
  )
}
