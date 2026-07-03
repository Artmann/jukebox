import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

import { Button } from '@/components/ui/button'

import type { ScanStatus } from '../hooks/useScanStatus'

dayjs.extend(relativeTime)

export function ScanPageHeader({
  isRunning,
  status,
  totals
}: {
  isRunning: boolean
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
          {isRunning ? 'Scanning your libraries…' : 'Library scan'}
        </h1>
        <ScanSummary
          isRunning={isRunning}
          status={status}
          totals={totals}
        />
      </div>
    </>
  )
}

export function ScanStartButton({
  isPending,
  isRunning,
  onStart
}: {
  isPending: boolean
  isRunning: boolean
  onStart: () => void
}) {
  return (
    <div className="mt-12 animate-fade-up animate-delay-2">
      <Button
        disabled={isRunning || isPending}
        onClick={onStart}
        size="lg"
        type="button"
      >
        {isRunning
          ? 'Scan in progress…'
          : isPending
            ? 'Starting…'
            : 'Start manual scan'}
      </Button>
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
