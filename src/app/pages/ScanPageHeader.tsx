import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

import { Button } from '@/components/ui/button'

import type { ScanStatus } from '../hooks/useScanStatus'
import type { ScanPhase } from './scan-types'

dayjs.extend(relativeTime)

function titleForPhase(phase: ScanPhase): string {
  if (phase === 'running') {
    return 'Scanning your libraries…'
  }

  if (phase === 'complete') {
    return 'Scan complete'
  }

  return 'Library scan'
}

export function ScanPageHeader({
  phase,
  status,
  totals
}: {
  phase: ScanPhase
  status: ScanStatus | undefined
  totals: { added: number; found: number; updated: number }
}) {
  return (
    <>
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
          {titleForPhase(phase)}
        </h1>
        <ScanSummary
          phase={phase}
          status={status}
          totals={totals}
        />
      </div>
    </>
  )
}

export function ScanActions({
  hasLibraries,
  isPending,
  lastJobFailed,
  onGoToLibrary,
  onStart,
  phase
}: {
  hasLibraries: boolean
  isPending: boolean
  lastJobFailed: boolean
  onGoToLibrary: () => void
  onStart: () => void
  phase: ScanPhase
}) {
  if (phase === 'complete') {
    // After a failed scan, retrying is the primary action; after a successful
    // one, moving on to the library is.
    const scanAgainVariant = lastJobFailed ? 'default' : 'ghost'
    const goToLibraryVariant = lastJobFailed ? 'ghost' : 'default'

    const scanAgainButton = (
      <Button
        disabled={isPending}
        key="scan-again"
        onClick={onStart}
        size="lg"
        type="button"
        variant={scanAgainVariant}
      >
        {isPending && <Loader2 className="animate-spin" />}
        {isPending ? 'Starting…' : 'Scan again'}
      </Button>
    )

    const goToLibraryButton = (
      <Button
        disabled={isPending}
        key="go-to-library"
        onClick={onGoToLibrary}
        size="lg"
        type="button"
        variant={goToLibraryVariant}
      >
        Go to Library
      </Button>
    )

    return (
      <div className="mt-12 flex items-center justify-end gap-3 animate-fade-up animate-delay-2">
        {lastJobFailed
          ? [goToLibraryButton, scanAgainButton]
          : [scanAgainButton, goToLibraryButton]}
      </div>
    )
  }

  const isRunning = phase === 'running'

  return (
    <div className="mt-12 flex items-center justify-end animate-fade-up animate-delay-2">
      <Button
        disabled={isRunning || isPending || !hasLibraries}
        onClick={onStart}
        size="lg"
        type="button"
      >
        {(isRunning || isPending) && <Loader2 className="animate-spin" />}
        {isRunning ? 'Scanning…' : isPending ? 'Starting…' : 'Start scan'}
      </Button>
    </div>
  )
}

function ScanSummary({
  phase,
  status,
  totals
}: {
  phase: ScanPhase
  status: ScanStatus | undefined
  totals: { added: number; found: number; updated: number }
}) {
  if (phase === 'running') {
    return (
      <p className="mt-2 text-muted-foreground">
        {totals.found > 0
          ? `${totals.found} files scanned so far.`
          : 'Discovering files…'}
      </p>
    )
  }

  if (phase === 'complete') {
    if (status?.lastJob?.status === 'error') {
      return <LastJobFailedLine job={status.lastJob} />
    }

    // The live per-library totals are the freshest numbers at the moment a
    // scan finishes — the status query may not have refetched yet.
    return (
      <p className="mt-2 text-muted-foreground">
        Scan completed · {totals.added} new, {totals.updated} updated,{' '}
        {totals.found} total.
      </p>
    )
  }

  if (status?.lastJob) {
    const job = status.lastJob

    if (job.status === 'error') {
      return <LastJobFailedLine job={job} />
    }

    const reference = job.endedAt ?? job.startedAt

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

function LastJobFailedLine({
  job
}: {
  job: NonNullable<ScanStatus['lastJob']>
}) {
  const reference = job.endedAt ?? job.startedAt

  return (
    <p className="mt-2 text-destructive">
      Last scan failed {dayjs(reference).fromNow()} —{' '}
      {job.errorMessage ?? 'Unknown error.'}
    </p>
  )
}
