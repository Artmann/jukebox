import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type Dispatch, type SetStateAction } from 'react'

import { scanStatusQueryKey } from './useScanStatus'
import { buildTraceparent, generateSpanId, generateTraceId } from '../lib/trace'
import type { LibraryProgress } from '../pages/scan-types'

export function useScanEventStream(
  setLibraries: Dispatch<SetStateAction<LibraryProgress[] | null>>,
  setLiveActive: Dispatch<SetStateAction<boolean>>,
  markLiveSeen: () => void
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    // EventSource can't set headers, so the trace context rides as a query
    // param that the backend request middleware reads as a fallback.
    const traceparent = buildTraceparent(generateTraceId(), generateSpanId())
    const eventSource = new EventSource(
      `/api/scan/stream?traceparent=${traceparent}`
    )

    // Resetting rows on the server's scan-started event (instead of after the
    // start POST resolves) keeps resets strictly ordered with the library
    // events on the same stream — a fast scan finishing before the POST
    // returns can no longer be clobbered back to "Waiting".
    eventSource.addEventListener('scan-started', () => {
      markLiveSeen()
      setLiveActive(true)
      setLibraries(
        (previous) =>
          previous?.map((library) => ({
            ...library,
            error: undefined,
            progress: { added: 0, total: 0, updated: 0 },
            status: 'pending' as const
          })) ?? null
      )
    })

    eventSource.addEventListener('library-start', (event) => {
      const payload = JSON.parse(event.data as string) as {
        libraryId: number
      }
      markLiveSeen()
      setLiveActive(true)
      setLibraries(
        (previous) =>
          previous?.map((library) =>
            library.id === payload.libraryId
              ? { ...library, status: 'scanning' as const }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('file-scanned', (event) => {
      const payload = JSON.parse(event.data as string) as {
        added: number
        libraryId: number
        total: number
        updated: number
      }
      setLibraries(
        (previous) =>
          previous?.map((library) =>
            library.id === payload.libraryId
              ? {
                  ...library,
                  progress: {
                    added: payload.added,
                    total: payload.total,
                    updated: payload.updated
                  }
                }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('library-complete', (event) => {
      const payload = JSON.parse(event.data as string) as {
        added: number
        libraryId: number
        total: number
        updated: number
      }
      setLibraries(
        (previous) =>
          previous?.map((library) =>
            library.id === payload.libraryId
              ? {
                  ...library,
                  progress: {
                    added: payload.added,
                    total: payload.total,
                    updated: payload.updated
                  },
                  status: 'complete' as const
                }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('library-error', (event) => {
      const payload = JSON.parse(event.data as string) as {
        error: string
        libraryId: number
      }
      setLibraries(
        (previous) =>
          previous?.map((library) =>
            library.id === payload.libraryId
              ? {
                  ...library,
                  error: payload.error,
                  status: 'error' as const
                }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('scan-complete', () => {
      setLiveActive(false)
      // Refresh the summary line ("Scanned a few seconds ago · …") with the
      // finished job's totals.
      void queryClient.invalidateQueries({ queryKey: scanStatusQueryKey })
    })

    return () => {
      eventSource.close()
    }
  }, [markLiveSeen, queryClient, setLibraries, setLiveActive])
}
