import { useEffect, useState } from 'react'
import type Player from 'video.js/dist/types/player'

const storageKey = 'jukebox-volume'

interface StoredVolume {
  muted: boolean
  volume: number
}

function getStoredVolume(): StoredVolume {
  try {
    const stored = localStorage.getItem(storageKey)

    if (stored) {
      return JSON.parse(stored) as StoredVolume
    }
  } catch {
    // Ignore errors
  }

  return { muted: false, volume: 1 }
}

function storeVolume(volume: number, muted: boolean): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ volume, muted }))
  } catch {
    // Ignore errors
  }
}

interface PlayerVolumeResult {
  muted: boolean
  setVolume: (volume: number) => void
  toggleMute: () => void
  volume: number
}

/**
 * Owns the player's volume: applies the persisted volume when a player
 * attaches, mirrors every volume change back into state and localStorage,
 * and exposes event handlers for the volume UI.
 */
export function usePlayerVolume(player: Player | null): PlayerVolumeResult {
  // Initialised straight from localStorage so no effect has to sync it later.
  const [volumeState, setVolumeState] = useState<StoredVolume>(getStoredVolume)

  const { muted, volume } = volumeState

  // Apply the stored volume to the player and mirror subsequent changes back
  // into state and localStorage.
  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const stored = getStoredVolume()

    player.volume(stored.volume)
    player.muted(stored.muted)

    const onVolumeChange = () => {
      if (player.isDisposed()) {
        return
      }

      const nextVolume = player.volume() ?? 1
      const nextMuted = player.muted() ?? false

      setVolumeState({ muted: nextMuted, volume: nextVolume })
      storeVolume(nextVolume, nextMuted)
    }

    player.on('volumechange', onVolumeChange)

    return () => {
      if (player.isDisposed()) {
        return
      }

      player.off('volumechange', onVolumeChange)
    }
  }, [player])

  const toggleMute = () => {
    if (!player || player.isDisposed()) {
      return
    }

    player.muted(!muted)
  }

  const setVolume = (nextVolume: number) => {
    if (!player || player.isDisposed()) {
      return
    }

    const clamped = Math.min(Math.max(nextVolume, 0), 1)

    player.volume(clamped)

    if (clamped > 0 && muted) {
      player.muted(false)
    }
  }

  return { muted, setVolume, toggleMute, volume }
}
