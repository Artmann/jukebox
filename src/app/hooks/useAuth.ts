import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'

export interface AuthStatus {
  enabled: boolean
  authenticated: boolean
}

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

async function fetchAuthStatus(): Promise<AuthStatus> {
  try {
    const response = await fetch('/api/auth/status')

    if (!response.ok) {
      throw new Error(await readError(response))
    }

    return (await response.json()) as AuthStatus
  } catch {
    throw new Error("Couldn't reach server. Check your connection.")
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
      let response: Response

      try {
        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        })
      } catch {
        throw new Error("Couldn't reach server. Check your connection.")
      }

      if (!response.ok) {
        throw new Error(await readError(response))
      }
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
      let response: Response

      try {
        response = await fetch('/api/auth/logout', { method: 'POST' })
      } catch {
        throw new Error("Couldn't reach server. Check your connection.")
      }

      if (!response.ok) {
        throw new Error(await readError(response))
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth-status'] })
    }
  })
}

export function useChangePassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      currentPassword?: string
      newPassword: string
    }) => {
      let response: Response

      try {
        response = await fetch('/api/auth/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        })
      } catch {
        throw new Error("Couldn't reach server. Check your connection.")
      }

      if (!response.ok) {
        throw new Error(await readError(response))
      }

      return (await response.json()) as { enabled: boolean }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth-status'] })
    }
  })
}
