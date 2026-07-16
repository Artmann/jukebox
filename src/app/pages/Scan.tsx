import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useScanEventStream } from '../hooks/useScanEventStream'
import {
  useScanStatus,
  useStartScan,
  type ScanStatus
} from '../hooks/useScanStatus'
import { api } from '../lib/api-client'
import { ScanLibraryList } from './ScanLibraryList'
import { ScanActions, ScanPageHeader } from './ScanPageHeader'
import {
  makeInitialLibraryProgress,
  mergeLibrariesWithJob,
  summarizeTotals,
  type LibraryInfo,
  type LibraryProgress,
  type ScanPhase
} from './scan-types'

async function fetchLibraries(): Promise<ReadonlyArray<LibraryInfo>> {
  return api((client) => client.scan.listLibraries())
}

function jobFromStatus(status: ScanStatus | undefined) {
  if (!status) {
    return null
  }

  return status.currentJob ?? status.lastJob
}

export function ScanPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: status } = useScanStatus()
  const startScanMutation = useStartScan()

  const [libraries, setLibraries] = useState<LibraryProgress[] | null>(null)
  const [liveActive, setLiveActive] = useState(false)
  // Flips once a scan finishes while the user is on the page, switching the
  // bottom action from "Start scan" to "Go to Library". Never set on a fresh
  // load, even when an older finished job exists.
  const [hasCompletedThisVisit, setHasCompletedThisVisit] = useState(false)
  const sawScanRef = useRef(false)
  // Once live SSE events arrive they are the freshest source of truth, so
  // the merged view derived from the (possibly stale) status query steps
  // aside in favor of the event-driven rows.
  const [liveSeen, setLiveSeen] = useState(false)
  const liveSeenRef = useRef(false)
  const loadedRef = useRef(false)
  const autoStartedRef = useRef(false)

  // Keeps the freshest status reachable from the stable markLiveSeen
  // callback without re-subscribing the event stream on every fetch.
  const statusRef = useRef<ScanStatus | undefined>(undefined)

  useEffect(() => {
    statusRef.current = status
  })

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
    if (liveSeenRef.current) {
      return
    }

    liveSeenRef.current = true

    // Fold the completed-so-far results into the rows before live deltas
    // apply on top, so libraries that finished before this page attached
    // keep their outcome instead of resetting to "Waiting".
    const job = jobFromStatus(statusRef.current)

    setLibraries((previous) =>
      previous === null ? previous : mergeLibrariesWithJob(previous, job)
    )
    setLiveSeen(true)
  }, [])

  // Intercept the stream's live-active toggles so completion is caught even
  // when a fast scan starts and finishes within a single render batch, where
  // `isRunning` never commits as true and the transition effect below would
  // miss it.
  const handleLiveActiveChange = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      if (value === true) {
        sawScanRef.current = true
      }

      if (value === false && sawScanRef.current) {
        setHasCompletedThisVisit(true)
      }

      setLiveActive(value)
    },
    []
  )

  useScanEventStream(setLibraries, handleLiveActiveChange, markLiveSeen)

  const isRunning = liveActive || (status?.isRunning ?? false)

  // Catch scans this page merely observed (opened mid-scan, so the running
  // signal came from the status query rather than a live-active toggle).
  useEffect(() => {
    if (isRunning) {
      sawScanRef.current = true
    } else if (sawScanRef.current) {
      setHasCompletedThisVisit(true)
    }
  }, [isRunning])

  const phase: ScanPhase = isRunning
    ? 'running'
    : hasCompletedThisVisit
      ? 'complete'
      : 'idle'

  // Until live SSE events arrive, derive the rows from the persisted
  // per-library results of the current or last job, so a page opened after
  // (or during) a scan shows real outcomes instead of "Waiting".
  const displayedLibraries = useMemo(() => {
    if (libraries === null) {
      return null
    }

    if (liveSeen) {
      return libraries
    }

    const merged = mergeLibrariesWithJob(libraries, jobFromStatus(status))

    if (!status?.isRunning) {
      return merged
    }

    // A scan is running but its events were missed (page opened mid-scan) —
    // show the not-yet-finished libraries as scanning rather than idle.
    return merged.map((library) =>
      library.status === 'pending'
        ? { ...library, status: 'scanning' as const }
        : library
    )
  }, [libraries, liveSeen, status])

  const totals = useMemo(() => {
    if (!displayedLibraries) {
      return { added: 0, found: 0, updated: 0 }
    }

    return summarizeTotals(displayedLibraries)
  }, [displayedLibraries])

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

  const hasLibraries = (displayedLibraries?.length ?? 0) > 0
  const lastJobFailed = status?.lastJob?.status === 'error'

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <ScanPageHeader
        phase={phase}
        status={status}
        totals={totals}
      />

      <div className="animate-fade-up animate-delay-1">
        <ScanLibraryList
          isRunning={isRunning}
          libraries={displayedLibraries}
        />
      </div>

      <ScanActions
        hasLibraries={hasLibraries}
        isPending={startScanMutation.isPending}
        lastJobFailed={lastJobFailed}
        onGoToLibrary={() => void navigate('/')}
        onStart={() => void handleStartScan()}
        phase={phase}
      />
    </div>
  )
}
