import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'

import type { LibraryEntry } from '../components/LibraryPathsForm'

interface ApiError {
  error?: { message?: string; referenceCount?: number }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError

    return body.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

export interface Library extends LibraryEntry {
  id: number
}

export interface TmdbKeyStatus {
  apiKey: string
  configured: boolean
}

export type ScanSchedule = 'off' | '6h' | '12h' | '24h'

export interface DeleteLibraryError extends Error {
  referenceCount?: number
  status: number
}

async function getJson<Result>(url: string): Promise<Result> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return (await response.json()) as Result
}

export function useTmdbKey() {
  return useQuery({
    queryKey: ['settings', 'tmdb-key'],
    queryFn: () => getJson<TmdbKeyStatus>('/api/settings/tmdb-key')
  })
}

export function useSaveTmdbKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await fetch('/api/settings/tmdb-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      })

      if (!response.ok) {
        throw new Error(await readError(response))
      }

      return (await response.json()) as { configured: boolean }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'tmdb-key']
      })
    }
  })
}

export function useSettingsLibraries() {
  return useQuery({
    queryKey: ['settings', 'libraries'],
    queryFn: () => getJson<Library[]>('/api/settings/libraries')
  })
}

export function useAddLibrary() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: LibraryEntry) => {
      const response = await fetch('/api/settings/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })

      if (!response.ok) {
        throw new Error(await readError(response))
      }

      return (await response.json()) as Library
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'libraries']
      })
    }
  })
}

export function useRemoveLibrary() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: number; force?: boolean }) => {
      const query = input.force === true ? '?force=true' : ''
      const response = await fetch(
        `/api/settings/libraries/${input.id}${query}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        let referenceCount: number | undefined
        let message = response.statusText

        try {
          const body = (await response.json()) as ApiError

          message = body.error?.message ?? message
          referenceCount = body.error?.referenceCount
        } catch {
          // Keep the default statusText message.
        }

        const error: DeleteLibraryError = Object.assign(
          new Error(message),
          { referenceCount, status: response.status }
        )

        throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'libraries']
      })
    }
  })
}

export function useScanSchedule() {
  return useQuery({
    queryKey: ['settings', 'scan-schedule'],
    queryFn: () =>
      getJson<{ schedule: ScanSchedule }>('/api/settings/scan-schedule')
  })
}

export function useSaveScanSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (schedule: ScanSchedule) => {
      const response = await fetch('/api/settings/scan-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule })
      })

      if (!response.ok) {
        throw new Error(await readError(response))
      }

      return (await response.json()) as { schedule: ScanSchedule }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'scan-schedule']
      })
    }
  })
}
