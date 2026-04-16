import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

export interface ScanJobSummary {
  added: number
  endedAt: string | null
  errorMessage: string | null
  id: number
  startedAt: string
  status: 'running' | 'done' | 'error'
  total: number
  updated: number
}

export interface ScanStatus {
  currentJob: ScanJobSummary | null
  isRunning: boolean
  lastJob: ScanJobSummary | null
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string }
    }

    return body.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

async function getJson<Result>(url: string): Promise<Result> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return (await response.json()) as Result
}

export const scanStatusQueryKey = ['scan', 'status'] as const

export function useScanStatus() {
  return useQuery({
    queryKey: scanStatusQueryKey,
    queryFn: () => getJson<ScanStatus>('/api/scan/status')
  })
}

export function useStartScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/scan/start', { method: 'POST' })

      if (!response.ok) {
        throw new Error(await readError(response))
      }

      return (await response.json()) as {
        status: 'started' | 'already-running'
      }
    },
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

    return () => {
      for (const event of events) {
        eventSource.removeEventListener(event, invalidate)
      }

      eventSource.close()
    }
  }, [queryClient])
}
