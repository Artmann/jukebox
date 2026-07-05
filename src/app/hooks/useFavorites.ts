import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export type {
  FavoriteItem,
  FavoriteMovieItem,
  FavoriteShowItem
} from '../../api/contract'

export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => api((client) => client.favorites.listFavorites())
  })
}

export type FavoriteTarget =
  | { kind: 'movie'; movieId: number }
  | { kind: 'show'; showId: number }

function statusKey(target: FavoriteTarget): readonly unknown[] {
  return target.kind === 'movie'
    ? ['favorite-status', 'movie', target.movieId]
    : ['favorite-status', 'show', target.showId]
}

function targetPayload(target: FavoriteTarget) {
  return target.kind === 'movie'
    ? { movieId: target.movieId }
    : { showId: target.showId }
}

export function useFavoriteStatus(target: FavoriteTarget) {
  return useQuery({
    queryKey: statusKey(target),
    queryFn: async () => {
      const urlParams =
        target.kind === 'movie'
          ? { movieId: String(target.movieId) }
          : { showId: String(target.showId) }

      const body = await api((client) =>
        client.favorites.getFavoriteStatus({ urlParams })
      )

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
      const payload = targetPayload(input.target)

      await api((client) =>
        input.favorite
          ? client.favorites.addFavorite({ payload })
          : client.favorites.removeFavorite({ payload })
      )
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: statusKey(variables.target)
      })
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
    }
  })
}
