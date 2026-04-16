import { Clock, Loader2, ScanLine, TriangleAlert } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'

import {
  useScanStatus,
  useScanStream,
  type ScanJobSummary
} from '../hooks/useScanStatus'

dayjs.extend(relativeTime)

function formatRelative(iso: string): string {
  return dayjs(iso).fromNow()
}

function RunningLabel({ job }: { job: ScanJobSummary }): ReactElement {
  const label =
    job.total > 0 ? `Scanning ${job.added + job.updated}/${job.total}` : 'Scanning…'

  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="hidden text-xs sm:inline">{label}</span>
    </span>
  )
}

function IdleLabel({ job }: { job: ScanJobSummary | null }): ReactElement {
  if (!job) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ScanLine className="size-4" aria-hidden="true" />
        <span className="hidden text-xs sm:inline">No scans yet</span>
      </span>
    )
  }

  const reference = job.endedAt ?? job.startedAt

  return (
    <span className="inline-flex items-center gap-1.5">
      <Clock className="size-4" aria-hidden="true" />
      <span className="hidden text-xs sm:inline">
        Scanned {formatRelative(reference)}
      </span>
    </span>
  )
}

function ErrorLabel(): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 text-destructive">
      <TriangleAlert className="size-4" aria-hidden="true" />
      <span className="hidden text-xs sm:inline">Last scan failed</span>
    </span>
  )
}

export function ScanIndicator(): ReactElement | null {
  useScanStream()
  const { data, isLoading } = useScanStatus()

  if (isLoading) {
    return null
  }

  const status = data ?? { currentJob: null, isRunning: false, lastJob: null }

  const tooltipContent = (() => {
    if (status.isRunning && status.currentJob) {
      const job = status.currentJob
      const aggregate = job.added + job.updated

      return (
        <>
          <p className="text-sm font-medium">Scanning</p>
          <p className="text-xs text-muted-foreground">
            {job.total > 0
              ? `${aggregate} of ${job.total} files processed`
              : 'Discovering files…'}
          </p>
          <p className="mt-2 text-xs">Click for live progress.</p>
        </>
      )
    }

    if (status.lastJob?.status === 'error') {
      return (
        <>
          <p className="text-sm font-medium text-destructive">
            Last scan failed
          </p>
          <p className="text-xs text-muted-foreground">
            {status.lastJob.errorMessage ?? 'Unknown error.'}
          </p>
          <p className="mt-2 text-xs">Click to retry.</p>
        </>
      )
    }

    if (status.lastJob) {
      const reference = status.lastJob.endedAt ?? status.lastJob.startedAt

      return (
        <>
          <p className="text-sm font-medium">
            Scanned {formatRelative(reference)}
          </p>
          <p className="text-xs text-muted-foreground">
            {status.lastJob.added} new, {status.lastJob.updated} updated,{' '}
            {status.lastJob.total} total
          </p>
          <p className="mt-2 text-xs">Click to run a scan.</p>
        </>
      )
    }

    return (
      <>
        <p className="text-sm font-medium">No scans yet</p>
        <p className="text-xs text-muted-foreground">
          Run your first scan to see your library.
        </p>
      </>
    )
  })()

  const indicator = (() => {
    if (status.isRunning && status.currentJob) {
      return <RunningLabel job={status.currentJob} />
    }

    if (status.lastJob?.status === 'error') {
      return <ErrorLabel />
    }

    return <IdleLabel job={status.lastJob} />
  })()

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Link
          to="/scan"
          className={cn(
            'inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm transition-colors hover:text-foreground',
            status.isRunning || status.lastJob?.status === 'error'
              ? 'text-foreground'
              : 'text-muted-foreground'
          )}
          aria-label="Scan status"
        >
          {indicator}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-64">
        {tooltipContent}
      </HoverCardContent>
    </HoverCard>
  )
}
