import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unreachableServerMessage } from '../lib/api-client'

export type { AuthStatus } from '../../api/contract'

async function fetchAuthStatus() {
  try {
    return await api((client) => client.auth.getStatus())
  } catch {
    throw new Error(unreachableServerMessage)
  }
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    staleTime: 30_000
  })
}

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (password: string) => {
      // Transport failures already surface as "Couldn't reach server. Check
      // your connection." — server rejections keep their own message.
      await api((client) => client.auth.login({ payload: { password } }))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth-status'] })
    }
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await api((client) => client.auth.logout())
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth-status'] })
    }
  })
}

export function useChangePassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { currentPassword?: string; newPassword: string }) =>
      api((client) => client.auth.changePassword({ payload: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth-status'] })
    }
  })
}
