import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type Player from 'video.js/dist/types/player'

import type { SubtitleTrack } from '../lib/media'

// 'off' is a reserved sentinel for the "no captions" menu item — subtitle ids
// are positive integers from the database so there's no collision.
export const subtitleOffValue = 'off'

interface SubtitleSelection {
  // The track list the selection was made for. When the list changes (e.g.
  // navigating to another episode) the player tears down and recreates its
  // remote text tracks, so a selection for the old list self-evicts and the
  // menu falls back to "Off" without any state resetting.
  forSubtitles: SubtitleTrack[] | undefined
  id: string
}

/**
 * Tracks which subtitle track the viewer picked and applies the selection to
 * the player's text tracks. Selections are keyed to the track list they were
 * made for, so stale selections evict themselves when the media changes.
 */
export function useSubtitleSelection(
  player: Player | null,
  subtitles: SubtitleTrack[] | undefined
): { activeSubtitleId: string; selectSubtitle: (id: string) => void } {
  const [selection, setSelection] = useState<SubtitleSelection | null>(null)

  const activeSubtitleId =
    selection && selection.forSubtitles === subtitles
      ? selection.id
      : subtitleOffValue

  // Surface track-load errors as a toast so the user knows to pick a
  // different language instead of staring at empty captions.
  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const remoteTrackElements = player.remoteTextTrackEls() as unknown as {
      length: number
      [index: number]: HTMLTrackElement
    } | null

    if (!remoteTrackElements || remoteTrackElements.length === 0) {
      return
    }

    const handleTrackError = () => {
      toast.error('Subtitle failed to load. Pick another track.')
      setSelection(null)
    }

    const elementsToCleanup: HTMLTrackElement[] = []

    for (let index = 0; index < remoteTrackElements.length; index++) {
      const element = remoteTrackElements[index]

      if (!element) {
        continue
      }

      element.addEventListener('error', handleTrackError)
      elementsToCleanup.push(element)
    }

    return () => {
      for (const element of elementsToCleanup) {
        element.removeEventListener('error', handleTrackError)
      }
    }
  }, [player, subtitles])

  const selectSubtitle = (selectedId: string) => {
    setSelection({ forSubtitles: subtitles, id: selectedId })

    if (!player || player.isDisposed()) {
      return
    }

    // video.js's TrackList type doesn't expose length/indexing, but the
    // runtime instance is iterable via `length`/[index]. Cast through unknown
    // to a minimal interface so we can walk it safely.
    const textTracks = player.textTracks() as unknown as {
      length: number
      [index: number]: TextTrack
    } | null

    if (!textTracks) {
      return
    }

    const selectedSubtitle = (subtitles ?? []).find(
      (subtitle) => subtitle.isSupported && String(subtitle.id) === selectedId
    )

    for (let index = 0; index < textTracks.length; index++) {
      const track = textTracks[index]

      if (!track || track.kind !== 'subtitles') {
        continue
      }

      if (selectedSubtitle && track.language === selectedSubtitle.language) {
        track.mode = 'showing'
      } else {
        track.mode = 'disabled'
      }
    }
  }

  return { activeSubtitleId, selectSubtitle }
}
