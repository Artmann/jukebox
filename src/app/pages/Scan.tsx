import { ArrowLeft, CheckCircle, Circle, Loader2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import {
  useScanStatus,
  useStartScan,
  type ScanStatus
} from '../hooks/useScanStatus'

dayjs.extend(relativeTime)

interface LibraryInfo {
  id: number
  name: string
  path: string
  type: string
}

interface LibraryProgress {
  error?: string
  id: number
  name: string
  progress: { added: number; total: number; updated: number }
  status: 'pending' | 'scanning' | 'complete' | 'error'
  type: string
}

async function fetchLibraries(): Promise<LibraryInfo[]> {
  const response = await fetch('/api/scan/libraries')

  if (!response.ok) {
    throw new Error('Failed to fetch libraries')
  }

  return (await response.json()) as LibraryInfo[]
}

function makeInitialLibraryProgress(library: LibraryInfo): LibraryProgress {
  return {
    id: library.id,
    name: library.name,
    progress: { added: 0, total: 0, updated: 0 },
    status: 'pending',
    type: library.type
  }
}

function summarizeTotals(libraries: LibraryProgress[]) {
  return libraries.reduce(
    (accumulator, library) => ({
      added: accumulator.added + library.progress.added,
      found: accumulator.found + library.progress.total,
      updated: accumulator.updated + library.progress.updated
    }),
    { added: 0, found: 0, updated: 0 }
  )
}

export function ScanPage() {
  const { data: status } = useScanStatus()
  const startScanMutation = useStartScan()

  const [libraries, setLibraries] = useState<LibraryProgress[] | null>(null)
  const [liveActive, setLiveActive] = useState(false)
  const loadedRef = useRef(false)

  const totals = useMemo(() => {
    if (!libraries) {
      return { added: 0, found: 0, updated: 0 }
    }

    return summarizeTotals(libraries)
  }, [libraries])

  const loadLibraries = useCallback(async () => {
    const fetched = await fetchLibraries()

    setLibraries(fetched.map(makeInitialLibraryProgress))
  }, [])

  useEffect(() => {
    if (loadedRef.current) {
      return
    }

    loadedRef.current = true
    void loadLibraries()
  }, [loadLibraries])

  // Subscribe to the SSE stream so live progress updates appear even when
  // the scan was triggered by another tab or the scheduler.
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
  }, [])

  const isRunning = liveActive || (status?.isRunning ?? false)

  async function handleStartScan() {
    try {
      const response = await startScanMutation.mutateAsync()

      if (response.status === 'already-running') {
        toast.info('A scan is already running.')

        return
      }

      setLibraries(
        (previous) =>
          previous?.map((library) => ({
            ...library,
            progress: { added: 0, total: 0, updated: 0 },
            status: 'pending',
            error: undefined
          })) ?? null
      )
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't start the scan."

      toast.error(message)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <div className="mb-6 animate-fade-up">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          to="/"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </div>

      <div className="mb-8 animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {isRunning ? 'Scanning your libraries…' : 'Library scan'}
        </h1>
        <ScanSummary status={status} totals={totals} isRunning={isRunning} />
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
        ) : libraries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No libraries configured. Add one from Settings before running a
            scan.
          </p>
        ) : (
          <div className="space-y-4">
            {libraries.map((library) => (
              <div
                className="flex items-center gap-3"
                key={library.id}
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
                    <p className="text-xs text-muted-foreground/50">Waiting</p>
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
                        'Scanning…'
                      )}
                    </p>
                  )}

                  {library.status === 'error' && (
                    <p className="text-xs text-destructive">{library.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-12 animate-fade-up animate-delay-2">
        <Button
          disabled={isRunning || startScanMutation.isPending}
          onClick={() => void handleStartScan()}
          size="lg"
          type="button"
        >
          {isRunning
            ? 'Scan in progress…'
            : startScanMutation.isPending
              ? 'Starting…'
              : 'Start manual scan'}
        </Button>
      </div>
    </div>
  )
}

function ScanSummary({
  isRunning,
  status,
  totals
}: {
  isRunning: boolean
  status: ScanStatus | undefined
  totals: { added: number; found: number; updated: number }
}) {
  if (isRunning) {
    return (
      <p className="mt-2 text-muted-foreground">
        {totals.found > 0
          ? `${totals.found} files scanned so far.`
          : 'Discovering files…'}
      </p>
    )
  }

  if (status?.lastJob) {
    const job = status.lastJob
    const reference = job.endedAt ?? job.startedAt

    if (job.status === 'error') {
      return (
        <p className="mt-2 text-destructive">
          Last scan failed{' '}
          {dayjs(reference).fromNow()} — {job.errorMessage ?? 'Unknown error.'}
        </p>
      )
    }

    return (
      <p className="mt-2 text-muted-foreground">
        Scanned {dayjs(reference).fromNow()} · {job.added} new, {job.updated}{' '}
        updated, {job.total} total.
      </p>
    )
  }

  return (
    <p className="mt-2 text-muted-foreground">
      No scans have run yet. Start one below.
    </p>
  )
}
