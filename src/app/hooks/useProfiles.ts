import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'

export interface Profile {
  id: number
  name: string
  emoji: string
  createdAt: string
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

async function fetchProfiles(): Promise<Profile[]> {
  const response = await fetch('/api/profiles')
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as Profile[]
}

async function fetchActiveProfile(): Promise<Profile> {
  const response = await fetch('/api/profiles/active')
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as Profile
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles
  })
}

export function useActiveProfile() {
  return useQuery({
    queryKey: ['active-profile'],
    queryFn: fetchActiveProfile
  })
}

function invalidateProfileScopedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  void queryClient.invalidateQueries({ queryKey: ['active-profile'] })
  void queryClient.invalidateQueries({ queryKey: ['continue-watching'] })
  void queryClient.invalidateQueries({ queryKey: ['favorites'] })
  void queryClient.invalidateQueries({ queryKey: ['favorite-status'] })
  void queryClient.invalidateQueries({ queryKey: ['progress'] })
  void queryClient.invalidateQueries({ queryKey: ['episode-progress'] })
}

export function useCreateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; emoji: string }) => {
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })

      if (!response.ok) throw new Error(await readError(response))

      return (await response.json()) as Profile
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    }
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: number
      name?: string
      emoji?: string
    }) => {
      const { id, ...patch } = input

      const response = await fetch(`/api/profiles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })

      if (!response.ok) throw new Error(await readError(response))

      return (await response.json()) as Profile
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
      const response = await fetch(`/api/profiles/${id}`, { method: 'DELETE' })

      if (!response.ok) throw new Error(await readError(response))
    },
    onSuccess: () => {
      invalidateProfileScopedQueries(queryClient)
    }
  })
}

export function useActivateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/profiles/${id}/activate`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error(await readError(response))

      return (await response.json()) as Profile
    },
    onSuccess: () => {
      invalidateProfileScopedQueries(queryClient)
    }
  })
}
