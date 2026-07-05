import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api } from '../lib/api-client'

export type {
  LibraryScanResult,
  ScanJobSummary,
  ScanStatus
} from '../../api/contract'

export const scanStatusQueryKey = ['scan', 'status'] as const

export function useScanStatus() {
  return useQuery({
    queryKey: scanStatusQueryKey,
    queryFn: () => api((client) => client.scan.getStatus()),
    refetchInterval: (query) => (query.state.data?.isRunning ? 2_000 : false)
  })
}

export function useStartScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api((client) => client.scan.startScan()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scanStatusQueryKey })
    }
  })
}

/**
 * Subscribe to the scan SSE stream. Invalidates `useScanStatus` on every
 * lifecycle event (library-start / file-scanned / library-complete /
 * scan-complete / library-error) so any component that reads status refreshes
 * in real time.
 */
export function useScanStream(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const eventSource = new EventSource('/api/scan/stream')

    function invalidate() {
      void queryClient.invalidateQueries({ queryKey: scanStatusQueryKey })
    }

    function invalidateSearch() {
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    }

    const events = [
      'library-start',
      'file-scanned',
      'library-complete',
      'library-error',
      'scan-complete'
    ]

    for (const event of events) {
      eventSource.addEventListener(event, invalidate)
    }

    // When a scan finishes the library may have new rows, so any cached
    // search results are stale. Other hooks already invalidate their caches
    // here — keep the search cache in sync too.
    eventSource.addEventListener('scan-complete', invalidateSearch)

    return () => {
      for (const event of events) {
        eventSource.removeEventListener(event, invalidate)
      }

      eventSource.removeEventListener('scan-complete', invalidateSearch)

      eventSource.close()
    }
  }, [queryClient])
}
