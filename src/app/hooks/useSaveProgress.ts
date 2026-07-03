import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef } from 'react'
import type Player from 'video.js/dist/types/player'

const saveIntervalMs = 10000

export interface SaveProgressInput {
  currentTime: number
  duration: number
  progressUrl: string
}

async function putProgress({
  currentTime,
  duration,
  progressUrl
}: SaveProgressInput): Promise<void> {
  const response = await fetch(progressUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentTime, duration })
  })

  if (!response.ok) {
    throw new Error(`Failed to save watch progress (${response.status})`)
  }
}

/**
 * Mutation for persisting watch progress. Saving is best-effort: failures are
 * captured by the mutation state instead of surfacing to the viewer.
 */
export function useSaveProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: putProgress,
    onSuccess: () => {
      // Keep every progress view in sync: the resume position, the episode
      // panel's per-episode bars, and the home page's Continue Watching row.
      void queryClient.invalidateQueries({ queryKey: ['progress'] })
      void queryClient.invalidateQueries({ queryKey: ['show-progress'] })
      void queryClient.invalidateQueries({ queryKey: ['continue-watching'] })
    }
  })
}

interface ProgressAutoSaveOptions {
  episodeId?: number
  movieId?: number
}

/**
 * Periodically persists the player's position while media plays, and flushes
 * one final save when the player goes away.
 */
export function useProgressAutoSave(
  player: Player | null,
  { episodeId, movieId }: ProgressAutoSaveOptions
): void {
  const { mutate: saveProgress } = useSaveProgress()
  const lastSavedTimeRef = useRef(0)

  const saveCurrentPosition = useEffectEvent(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const currentTime = player.currentTime() ?? 0
    const duration = player.duration() ?? 0

    if (currentTime === lastSavedTimeRef.current) {
      return
    }

    lastSavedTimeRef.current = currentTime

    const progressUrl = episodeId
      ? `/api/progress/episode/${episodeId}`
      : `/api/progress/${movieId}`

    saveProgress({ currentTime, duration, progressUrl })
  })

  useEffect(() => {
    if (!player) {
      return
    }

    const interval = setInterval(saveCurrentPosition, saveIntervalMs)

    return () => {
      clearInterval(interval)
      saveCurrentPosition()
    }
  }, [player])
}
