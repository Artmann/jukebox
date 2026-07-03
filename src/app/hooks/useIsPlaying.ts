import { useCallback, useSyncExternalStore } from 'react'
import type Player from 'video.js/dist/types/player'

/**
 * Reads the player's play/pause state as an external store so components
 * re-render on play/pause without hand-rolled effect state syncing.
 */
export function useIsPlaying(player: Player | null): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!player || player.isDisposed()) {
        return () => {}
      }

      player.on('play', onStoreChange)
      player.on('pause', onStoreChange)

      return () => {
        if (player.isDisposed()) {
          return
        }

        player.off('play', onStoreChange)
        player.off('pause', onStoreChange)
      }
    },
    [player]
  )

  const getSnapshot = () => {
    if (!player || player.isDisposed()) {
      return false
    }

    return !player.paused()
  }

  return useSyncExternalStore(subscribe, getSnapshot)
}
