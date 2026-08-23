import { useCallback, useEffect, useState } from 'react'
import type Player from 'video.js/dist/types/player'

interface SourceSwapFadeResult {
  beginSwap: () => void
  isSwapping: boolean
}

/**
 * Fades the player to black while a new source spins up (call `beginSwap`
 * when swapping), so the jump reads as a seek instead of a reload. The fade
 * drops as soon as the new source is actually playing.
 */
export function useSourceSwapFade(player: Player | null): SourceSwapFadeResult {
  const [isSwapping, setIsSwapping] = useState(false)

  const beginSwap = useCallback(() => {
    setIsSwapping(true)
  }, [])

  // Drop the fade overlay as soon as the new source is actually playing.
  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const onPlaying = () => setIsSwapping(false)

    player.on('playing', onPlaying)

    return () => {
      if (player.isDisposed()) {
        return
      }

      player.off('playing', onPlaying)
    }
  }, [player])

  return { beginSwap, isSwapping }
}
