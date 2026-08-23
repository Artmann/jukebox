import { useEffect, type RefObject } from 'react'
import type Player from 'video.js/dist/types/player'

import type { SubtitleTrack } from '../lib/media'

/**
 * Syncs remote text tracks (subtitles) with the `subtitles` prop. Skipped for
 * unsupported formats (.ass) — those are surfaced in the UI as disabled menu
 * items but never actually loaded into the player.
 */
export function useSubtitleTracks(
  playerRef: RefObject<Player | null>,
  subtitles: ReadonlyArray<SubtitleTrack> | undefined
): void {
  useEffect(() => {
    const player = playerRef.current

    if (!player || player.isDisposed()) {
      return
    }

    const tracks = subtitles ?? []
    const supportedTracks = tracks.filter((track) => track.isSupported)
    const addedElements: unknown[] = []

    for (const track of supportedTracks) {
      const trackElement = player.addRemoteTextTrack(
        {
          src: `/api/subtitles/${track.id}`,
          srclang: track.language,
          label: track.displayLanguage,
          kind: 'subtitles',
          default: false
        },
        false
      )

      addedElements.push(trackElement)
    }

    return () => {
      if (player.isDisposed()) {
        return
      }

      for (const element of addedElements) {
        player.removeRemoteTextTrack(
          element as Parameters<Player['removeRemoteTextTrack']>[0]
        )
      }
    }
  }, [playerRef, subtitles])
}
