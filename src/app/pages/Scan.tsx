import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useAutoStartScan } from '../hooks/useAutoStartScan'
import { useScanProgress } from '../hooks/useScanProgress'
import { useStartScan } from '../hooks/useScanStatus'
import { ScanLibraryList } from './ScanLibraryList'
import { ScanActions, ScanPageHeader } from './ScanPageHeader'

export function ScanPage() {
  const navigate = useNavigate()
  const startScanMutation = useStartScan()
  const { displayedLibraries, isRunning, phase, status, totals } =
    useScanProgress()

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

  useAutoStartScan({
    isScanRunning: status?.isRunning ?? false,
    isStatusLoaded: status !== undefined,
    startScan: handleStartScan
  })

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
