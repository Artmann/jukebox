import { useEffect, useState } from 'react'
import type Player from 'video.js/dist/types/player'

const indicatorVisibleMs = 1200

export interface VolumeIndicatorState {
  muted: boolean
  volume: number
}

/**
 * Shows a transient volume readout whenever the player's volume or mute state
 * changes. Returns null while the indicator should be hidden.
 */
export function useVolumeIndicator(
  player: Player | null
): VolumeIndicatorState | null {
  const [indicator, setIndicator] = useState<VolumeIndicatorState | null>(null)

  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    let hideTimer: ReturnType<typeof setTimeout> | null = null

    const onVolumeChange = () => {
      if (player.isDisposed()) {
        return
      }

      setIndicator({
        muted: player.muted() ?? false,
        volume: player.volume() ?? 1
      })

      if (hideTimer) {
        clearTimeout(hideTimer)
      }

      hideTimer = setTimeout(() => {
        setIndicator(null)
      }, indicatorVisibleMs)
    }

    player.on('volumechange', onVolumeChange)

    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
      }

      if (player.isDisposed()) {
        return
      }

      player.off('volumechange', onVolumeChange)
    }
  }, [player])

  return indicator
}
