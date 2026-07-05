import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export type { Profile } from '../../api/contract'

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => api((client) => client.profiles.listProfiles())
  })
}

export function useActiveProfile() {
  return useQuery({
    queryKey: ['active-profile'],
    queryFn: () => api((client) => client.profiles.getActiveProfile())
  })
}

const profileScopedQueryKeys = [
  ['profiles'],
  ['active-profile'],
  ['continue-watching'],
  ['favorites'],
  ['favorite-status'],
  ['progress'],
  ['episode-progress']
] as const

export function useCreateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string; emoji: string }) =>
      api((client) => client.profiles.createProfile({ payload: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    }
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: number; name?: string; emoji?: string }) => {
      const { id, ...patch } = input

      return api((client) =>
        client.profiles.updateProfile({
          path: { id: String(id) },
          payload: patch
        })
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['active-profile'] })
    }
  })
}

export function useDeleteProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      await api((client) =>
        client.profiles.deleteProfile({ path: { id: String(id) } })
      )
    },
    onSuccess: () => {
      for (const queryKey of profileScopedQueryKeys) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
  })
}

export function useActivateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      api((client) =>
        client.profiles.activateProfile({ path: { id: String(id) } })
      ),
    onSuccess: () => {
      for (const queryKey of profileScopedQueryKeys) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
  })
}
