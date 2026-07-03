import { useEffect, type Dispatch, type SetStateAction } from 'react'

import type { LibraryProgress } from '../pages/scan-types'

export function useScanEventStream(
  setLibraries: Dispatch<SetStateAction<LibraryProgress[] | null>>,
  setLiveActive: Dispatch<SetStateAction<boolean>>
) {
  useEffect(() => {
    const eventSource = new EventSource('/api/scan/stream')

    eventSource.addEventListener('library-start', (event) => {
      const payload = JSON.parse(event.data as string) as {
        libraryId: number
      }
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
    })

    return () => {
      eventSource.close()
    }
  }, [setLibraries, setLiveActive])
}
