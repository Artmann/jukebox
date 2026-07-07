import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

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

function targetPayload(target: FavoriteTarget) {
  return target.kind === 'movie'
    ? { movieId: target.movieId }
    : { showId: target.showId }
}

export function useIsFavorite(target: FavoriteTarget): boolean | undefined {
  const { data: favorites } = useFavorites()

  return useMemo(() => {
    if (favorites === undefined) {
      return undefined
    }

    if (target.kind === 'movie') {
      return favorites.some(
        (favorite) =>
          favorite.type === 'movie' && favorite.movie.id === target.movieId
      )
    }

    return favorites.some(
      (favorite) =>
        favorite.type === 'show' && favorite.show.id === target.showId
    )
  }, [favorites, target])
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
    }
  })
}
