import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'

import type { Movie } from './useMovies'
import type { Show } from '../lib/media'

export interface FavoriteMovieItem {
  type: 'movie'
  createdAt: string
  movie: Movie
}

export interface FavoriteShowItem {
  type: 'show'
  createdAt: string
  show: Show
}

export type FavoriteItem = FavoriteMovieItem | FavoriteShowItem

interface ApiError {
  error?: { message?: string }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError
    return body.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

async function fetchFavorites(): Promise<FavoriteItem[]> {
  const response = await fetch('/api/favorites')
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as FavoriteItem[]
}

export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: fetchFavorites
  })
}

export type FavoriteTarget =
  | { kind: 'movie'; movieId: number }
  | { kind: 'show'; showId: number }

function statusUrl(target: FavoriteTarget): string {
  return target.kind === 'movie'
    ? `/api/favorites/status?movieId=${target.movieId}`
    : `/api/favorites/status?showId=${target.showId}`
}

function statusKey(target: FavoriteTarget): readonly unknown[] {
  return target.kind === 'movie'
    ? ['favorite-status', 'movie', target.movieId]
    : ['favorite-status', 'show', target.showId]
}

export function useFavoriteStatus(target: FavoriteTarget) {
  return useQuery({
    queryKey: statusKey(target),
    queryFn: async () => {
      const response = await fetch(statusUrl(target))
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { favorite: boolean }
      return body.favorite
    }
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      target: FavoriteTarget
      favorite: boolean
    }) => {
      const body =
        input.target.kind === 'movie'
          ? { movieId: input.target.movieId }
          : { showId: input.target.showId }

      const response = await fetch('/api/favorites', {
        method: input.favorite ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) throw new Error(await readError(response))
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: statusKey(variables.target)
      })
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
    }
  })
}
