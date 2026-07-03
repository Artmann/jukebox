import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useScanEventStream } from '../hooks/useScanEventStream'
import { useScanStatus, useStartScan } from '../hooks/useScanStatus'
import { ScanLibraryList } from './ScanLibraryList'
import { ScanPageHeader, ScanStartButton } from './ScanPageHeader'
import {
  makeInitialLibraryProgress,
  mergeLibrariesWithJob,
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
  const navigate = useNavigate()
  const { data: status } = useScanStatus()
  const startScanMutation = useStartScan()

  const [libraries, setLibraries] = useState<LibraryProgress[] | null>(null)
  const [liveActive, setLiveActive] = useState(false)
  const loadedRef = useRef(false)
  const autoStartedRef = useRef(false)
  // Once live SSE events arrive they are the freshest source of truth, so
  // reconciliation from the (possibly stale) status query must stop.
  const liveSeenRef = useRef(false)

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

  const markLiveSeen = useCallback(() => {
    liveSeenRef.current = true
  }, [])

  useScanEventStream(setLibraries, setLiveActive, markLiveSeen)

  // Reconcile library rows with the persisted per-library results of the
  // current or last job, so a page opened after a finished scan shows real
  // outcomes instead of "Waiting". Live SSE events take over once they arrive.
  // Depends on both fetches — whichever of status/libraries resolves last
  // triggers the merge.
  const librariesLoaded = libraries !== null

  useEffect(() => {
    if (liveSeenRef.current || !status || !librariesLoaded) {
      return
    }

    const job = status.currentJob ?? status.lastJob

    setLibraries((previous) =>
      previous === null ? previous : mergeLibrariesWithJob(previous, job)
    )
  }, [librariesLoaded, status])

  // If a scan is already running when this page opens (or SSE events were
  // missed), reflect that in the UI instead of leaving every library on
  // "Waiting".
  useEffect(() => {
    if (!status?.isRunning || liveSeenRef.current) {
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

  const startScan = startScanMutation.mutateAsync

  const handleStartScan = useCallback(async () => {
    try {
      const response = await startScan()

      if (response.status === 'already-running') {
        toast.info('A scan is already running.')
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't start the scan."

      toast.error(message)
    }
  }, [startScan])

  // Kick off a scan automatically when arriving from setup ("Save and scan").
  // The router state is cleared right away so a refresh doesn't re-trigger.
  useEffect(() => {
    const state = location.state as { autoStart?: boolean } | null

    if (!state?.autoStart || autoStartedRef.current || !status) {
      return
    }

    autoStartedRef.current = true
    void navigate(location.pathname, { replace: true, state: null })

    if (!status.isRunning) {
      void handleStartScan()
    }
  }, [handleStartScan, location, navigate, status])

  const isRunning = liveActive || (status?.isRunning ?? false)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <ScanPageHeader
        isRunning={isRunning}
        status={status}
        totals={totals}
      />

      <div className="animate-fade-up animate-delay-1">
        <ScanLibraryList
          isRunning={isRunning}
          libraries={libraries}
        />
      </div>

      <ScanStartButton
        isPending={startScanMutation.isPending}
        isRunning={isRunning}
        onStart={() => void handleStartScan()}
      />
    </div>
  )
}
