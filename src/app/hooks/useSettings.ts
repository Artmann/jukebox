import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ScanScheduleValue } from '../../api/contract'
import type { LibraryEntry } from '../components/library-draft'
import { api, type ApiError } from '../lib/api-client'

export type { Library } from '../../api/contract'
export type { ScanScheduleResponse as ScanScheduleStatus } from '../../api/contract'

export type ScanSchedule = ScanScheduleValue

/**
 * Thrown by useRemoveLibrary. `status === 409` with a referenceCount means
 * the library still has scanned items and needs the force flag.
 */
export type DeleteLibraryError = ApiError

export function useSettingsLibraries() {
  return useQuery({
    queryKey: ['settings', 'libraries'],
    queryFn: () => api((client) => client.settings.listLibraries())
  })
}

export function useAddLibrary() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: LibraryEntry) =>
      api((client) => client.settings.createLibrary({ payload: input })),
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
      // Failures reach the caller as an ApiError carrying the status and,
      // for 409 library-in-use conflicts, the referenceCount.
      await api((client) =>
        client.settings.deleteLibrary({
          path: { id: String(input.id) },
          urlParams: input.force === true ? { force: 'true' } : {}
        })
      )
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
    queryFn: () => api((client) => client.settings.getScanSchedule())
  })
}

export function useSaveScanSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (schedule: ScanSchedule) =>
      api((client) =>
        client.settings.updateScanSchedule({ payload: { schedule } })
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'scan-schedule']
      })
    }
  })
}
