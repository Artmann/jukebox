import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef } from 'react'
import invariant from 'tiny-invariant'
import type Player from 'video.js/dist/types/player'

import { api } from '../lib/api-client'

const saveIntervalMs = 10000

const episodeProgressPattern = /^\/api\/progress\/episode\/(\d+)$/
const movieProgressPattern = /^\/api\/progress\/(\d+)$/

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
  const payload = { currentTime, duration }

  const episodeMatch = episodeProgressPattern.exec(progressUrl)

  if (episodeMatch) {
    await api((client) =>
      client.episodeProgress.saveEpisodeProgress({
        path: { episodeId: Number(episodeMatch[1]) },
        payload
      })
    )

    return
  }

  const movieMatch = movieProgressPattern.exec(progressUrl)

  invariant(movieMatch, `Unrecognized progress url: ${progressUrl}`)

  await api((client) =>
    client.progress.saveMovieProgress({
      path: { movieId: Number(movieMatch[1]) },
      payload
    })
  )
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
