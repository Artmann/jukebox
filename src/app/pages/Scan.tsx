import { CheckCircle, Circle, Loader2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface LibraryProgress {
  error?: string
  name: string
  progress: { added: number; total: number; updated: number }
  status: 'pending' | 'scanning' | 'complete' | 'error'
  type: string
}

async function fetchLibraries(): Promise<
  Array<{ id: number; name: string; path: string; type: string }>
> {
  const response = await fetch('/api/scan/libraries')

  if (!response.ok) {
    throw new Error('Failed to fetch libraries')
  }

  return (await response.json()) as Array<{
    id: number
    name: string
    path: string
    type: string
  }>
}

export function ScanPage() {
  const navigate = useNavigate()

  const [libraries, setLibraries] = useState<LibraryProgress[] | null>(null)
  const [scanning, setScanning] = useState(true)
  const startedRef = useRef(false)

  const totals = useMemo(() => {
    if (!libraries) {
      return { added: 0, found: 0, updated: 0 }
    }

    return libraries.reduce(
      (accumulator, library) => ({
        added: accumulator.added + library.progress.added,
        found: accumulator.found + library.progress.total,
        updated: accumulator.updated + library.progress.updated
      }),
      { added: 0, found: 0, updated: 0 }
    )
  }, [libraries])

  useEffect(() => {
    if (startedRef.current) {
      return
    }

    startedRef.current = true
    void loadAndScan()
  }, [])

  async function loadAndScan() {
    const fetched = await fetchLibraries()

    const initial: LibraryProgress[] = fetched.map((library) => ({
      name: library.name,
      progress: { added: 0, total: 0, updated: 0 },
      status: 'pending',
      type: library.type
    }))

    setLibraries(initial)
    startScan()
  }

  function startScan() {
    const eventSource = new EventSource('/api/scan/stream')

    eventSource.addEventListener('library-start', (event) => {
      const data = JSON.parse(event.data) as { index: number }

      setLibraries(
        (previous) =>
          previous?.map((library, i) =>
            i === data.index
              ? { ...library, status: 'scanning' as const }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('file-scanned', (event) => {
      const data = JSON.parse(event.data) as {
        added: number
        index: number
        total: number
        updated: number
      }

      setLibraries(
        (previous) =>
          previous?.map((library, i) =>
            i === data.index
              ? {
                  ...library,
                  progress: {
                    added: data.added,
                    total: data.total,
                    updated: data.updated
                  }
                }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('library-complete', (event) => {
      const data = JSON.parse(event.data) as {
        added: number
        index: number
        total: number
        updated: number
      }

      setLibraries(
        (previous) =>
          previous?.map((library, i) =>
            i === data.index
              ? {
                  ...library,
                  progress: {
                    added: data.added,
                    total: data.total,
                    updated: data.updated
                  },
                  status: 'complete' as const
                }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('library-error', (event) => {
      const data = JSON.parse(event.data) as {
        error: string
        index: number
      }

      setLibraries(
        (previous) =>
          previous?.map((library, i) =>
            i === data.index
              ? { ...library, error: data.error, status: 'error' as const }
              : library
          ) ?? null
      )
    })

    eventSource.addEventListener('scan-complete', () => {
      setScanning(false)
      eventSource.close()
    })

    eventSource.onerror = () => {
      setScanning(false)
      eventSource.close()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10 animate-fade-up">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {scanning ? 'Scanning your libraries...' : 'Your library is ready'}
          </h1>
          {!scanning && (
            <p className="mt-2 text-muted-foreground">
              {totals.found} movies and episodes found.
            </p>
          )}
        </div>

        <div className="animate-fade-up animate-delay-1">
          {libraries === null ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  className="flex items-center gap-3"
                  key={i}
                >
                  <Skeleton className="size-4 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {libraries.map((library, index) => (
                <div
                  className="flex items-center gap-3"
                  key={index}
                >
                  {library.status === 'pending' && (
                    <Circle className="size-4 shrink-0 text-muted-foreground/20" />
                  )}
                  {library.status === 'scanning' && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-foreground" />
                  )}
                  {library.status === 'complete' && (
                    <CheckCircle className="size-4 shrink-0 text-foreground" />
                  )}
                  {library.status === 'error' && (
                    <XCircle className="size-4 shrink-0 text-destructive" />
                  )}

                  <div className="flex-1">
                    <p className="text-sm text-foreground">{library.name}</p>

                    {library.status === 'pending' && (
                      <p className="text-xs text-muted-foreground/50">
                        Waiting
                      </p>
                    )}

                    {(library.status === 'scanning' ||
                      library.status === 'complete') && (
                      <p className="text-xs text-muted-foreground">
                        {library.progress.total > 0 ? (
                          <>
                            {library.progress.total} files
                            {library.progress.added > 0 &&
                              ` \u00b7 ${library.progress.added} new`}
                            {library.progress.updated > 0 &&
                              ` \u00b7 ${library.progress.updated} updated`}
                          </>
                        ) : (
                          'Scanning...'
                        )}
                      </p>
                    )}

                    {library.status === 'error' && (
                      <p className="text-xs text-destructive">
                        {library.error}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!scanning && (
          <div className="mt-12 animate-fade-up animate-delay-2">
            <Button
              onClick={() => navigate('/')}
              size="lg"
            >
              Start Watching
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
