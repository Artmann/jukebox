import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { useScanEventStream } from '../hooks/useScanEventStream'
import {
  useScanStatus,
  useStartScan
} from '../hooks/useScanStatus'
import { ScanLibraryList } from './ScanLibraryList'
import { ScanPageHeader, ScanStartButton } from './ScanPageHeader'
import {
  makeInitialLibraryProgress,
  summarizeTotals,
  type LibraryInfo,
  type LibraryProgress
} from './scan-types'

async function fetchLibraries(): Promise<LibraryInfo[]> {
  const response = await fetch('/api/scan/libraries')

  if (!response.ok) {
    throw new Error('Failed to fetch libraries')
  }

  return (await response.json()) as LibraryInfo[]
}

export function ScanPage() {
  const location = useLocation()
  const { data: status } = useScanStatus()
  const startScanMutation = useStartScan()

  const [libraries, setLibraries] = useState<LibraryProgress[] | null>(null)
  const [liveActive, setLiveActive] = useState(false)
  const loadedRef = useRef(false)
  const autoStartedRef = useRef(false)

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

  useScanEventStream(setLibraries, setLiveActive)

  // If a scan is already running when this page opens (or SSE events were
  // missed), reflect that in the UI instead of leaving every library on
  // "Waiting".
  useEffect(() => {
    if (!status?.isRunning) {
      return
    }

    setLiveActive(true)
    setLibraries((previous) => {
      if (
        previous === null ||
        !previous.some((library) => library.status === 'pending')
      ) {
        return previous
      }

      return previous.map((library) =>
        library.status === 'pending'
          ? { ...library, status: 'scanning' as const }
          : library
      )
    })
  }, [status?.isRunning])

  const handleStartScan = useCallback(async () => {
    try {
      const response = await startScanMutation.mutateAsync()

      if (response.status === 'already-running') {
        toast.info('A scan is already running.')
        setLiveActive(true)

        return
      }

      setLiveActive(true)
      setLibraries(
        (previous) =>
          previous?.map((library) => ({
            ...library,
            progress: { added: 0, total: 0, updated: 0 },
            status: 'scanning' as const,
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
  }, [startScanMutation])

  // After first-time setup, start the initial scan automatically.
  useEffect(() => {
    const autoStart = (location.state as { autoStart?: boolean } | null)
      ?.autoStart

    if (
      !autoStart ||
      autoStartedRef.current ||
      libraries === null ||
      libraries.length === 0 ||
      status?.isRunning
    ) {
      return
    }

    autoStartedRef.current = true
    void handleStartScan()
  }, [handleStartScan, libraries, location.state, status?.isRunning])

  const isRunning = liveActive || (status?.isRunning ?? false)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <ScanPageHeader
        isRunning={isRunning}
        status={status}
        totals={totals}
      />

      <div className="animate-fade-up animate-delay-1">
        <ScanLibraryList libraries={libraries} />
      </div>

      <ScanStartButton
        isPending={startScanMutation.isPending}
        isRunning={isRunning}
        onStart={() => void handleStartScan()}
      />
    </div>
  )
}
