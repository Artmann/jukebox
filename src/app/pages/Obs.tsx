import {
  ArrowLeft,
  ChevronDownIcon,
  ChevronRightIcon,
  MonitorIcon,
  ServerIcon
} from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import invariant from 'tiny-invariant'

import { cn } from '@/lib/utils'

import {
  useTelemetryErrors,
  useTelemetryStats,
  useTrace,
  useTraces,
  type TelemetryError,
  type TelemetrySpan,
  type TraceSummary
} from '../hooks/useObs'

type Tab = 'errors' | 'stats' | 'traces'

const tabs: { label: string; value: Tab }[] = [
  { label: 'Traces', value: 'traces' },
  { label: 'Errors', value: 'errors' },
  { label: 'Performance', value: 'stats' }
]

function isTab(value: string | undefined): value is Tab {
  return tabs.some((entry) => entry.value === value)
}

// Fixed rem scale for this diagnostic view — size, weight, and color combine
// for hierarchy instead of relying on size alone.
const type = {
  backLink: 'text-sm leading-normal text-muted-foreground',
  caption: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',
  data: 'text-sm tabular-nums',
  dataMuted: 'text-sm tabular-nums text-muted-foreground',
  filterActive: 'text-sm font-medium text-foreground',
  filterInactive: 'text-sm text-muted-foreground hover:text-foreground',
  pageSubtitle: 'mt-2 text-base leading-relaxed text-muted-foreground',
  pageTitle: 'text-2xl font-semibold leading-none tracking-tight',
  rowPrimary: 'text-base leading-snug text-foreground',
  rowSecondary: 'mt-1.5 text-sm leading-normal text-muted-foreground',
  sectionHint: 'text-sm leading-relaxed text-muted-foreground',
  stack: 'text-xs leading-relaxed text-muted-foreground',
  tabActive: 'border-foreground text-foreground',
  tabBase:
    'border-b-2 pb-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  tabInactive: 'border-transparent text-muted-foreground hover:text-foreground'
} as const

const focusRing =
  'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const traceRowGrid =
  'grid grid-cols-[1rem_0.5rem_minmax(0,1fr)_auto_4rem] items-center gap-x-3 sm:grid-cols-[1rem_0.5rem_minmax(0,1fr)_auto_4rem_5rem]'

const errorRowGrid =
  'grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem] items-start gap-x-4'

const statsRowGrid =
  'grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem_4.5rem] items-center gap-x-4'

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1) {
    return '0 ms'
  }

  if (milliseconds < 1_000) {
    return `${Math.round(milliseconds)} ms`
  }

  return `${(milliseconds / 1_000).toFixed(2)} s`
}

function formatClock(milliseconds: number): string {
  return new Date(milliseconds).toLocaleTimeString()
}

function relativeTime(milliseconds: number): string {
  const seconds = Math.round((Date.now() - milliseconds) / 1_000)

  if (seconds < 60) {
    return `${seconds}s ago`
  }

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)

  return `${hours}h ago`
}

function spanColor(span: TelemetrySpan): string {
  if (span.statusCode === 'error') {
    return 'var(--destructive)'
  }

  switch (span.kind) {
    case 'client':
      return 'var(--chart-3)'
    case 'server':
      return 'var(--chart-1)'
    default:
      return 'var(--chart-4)'
  }
}

function StatusDot({ statusCode }: { statusCode: string }): ReactElement {
  const color =
    statusCode === 'error'
      ? 'bg-destructive'
      : statusCode === 'ok'
        ? 'bg-foreground/40'
        : 'bg-muted-foreground'

  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', color)}
    />
  )
}

function FilterLinks<T extends string | number>({
  onChange,
  options,
  value
}: {
  onChange: (value: T) => void
  options: { label: string; value: T }[]
  value: T
}): ReactElement {
  return (
    <div
      className="flex flex-wrap gap-x-1 gap-y-1"
      role="group"
    >
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            focusRing,
            'min-h-11 rounded-md px-3 transition-colors',
            value === option.value ? type.filterActive : type.filterInactive
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function spanKindLabel(kind: string): string | null {
  if (kind === 'client') {
    return 'Browser'
  }

  if (kind === 'server') {
    return 'Server'
  }

  return null
}

function SpanKindIcon({ kind }: { kind: string }): ReactElement | null {
  const label = spanKindLabel(kind)

  if (label === null) {
    return null
  }

  const className = 'size-3.5 shrink-0 text-muted-foreground'

  if (kind === 'client') {
    return (
      <MonitorIcon
        aria-hidden
        className={className}
      />
    )
  }

  return (
    <ServerIcon
      aria-hidden
      className={className}
    />
  )
}

function TraceWaterfall({ traceId }: { traceId: string }): ReactElement {
  const trace = useTrace(traceId)

  if (trace.isLoading) {
    return (
      <div
        aria-live="polite"
        className="border-t py-4 pl-11 text-sm leading-relaxed text-muted-foreground"
        role="status"
      >
        Loading trace details…
      </div>
    )
  }

  const spans = trace.data?.spans ?? []

  if (spans.length === 0) {
    return (
      <div className="border-t py-4 pl-8 text-sm leading-relaxed text-muted-foreground">
        This trace has no span data.
      </div>
    )
  }

  const traceStart = Math.min(...spans.map((span) => span.startTime))
  const traceEnd = Math.max(...spans.map((span) => span.endTime))
  const total = Math.max(traceEnd - traceStart, 1)

  const byId = new Map(spans.map((span) => [span.spanId, span]))

  function depthOf(span: TelemetrySpan): number {
    let depth = 0
    let current: TelemetrySpan | undefined = span

    while (current?.parentSpanId != null && depth < 20) {
      const parent = byId.get(current.parentSpanId)

      if (parent === undefined) {
        break
      }

      depth += 1
      current = parent
    }

    return depth
  }

  const ordered = [...spans].sort((first, second) => first.startTime - second.startTime)

  return (
    <div className="space-y-1 border-t py-4 pl-11">
      {ordered.map((span) => {
        const left = ((span.startTime - traceStart) / total) * 100
        const width = Math.max((span.durationMs / total) * 100, 0.75)

        return (
          <div
            className="flex items-center gap-3 text-xs leading-normal"
            key={span.spanId}
          >
            <div
              className="flex w-72 shrink-0 items-center gap-1.5 truncate text-muted-foreground"
              style={{ paddingLeft: `${depthOf(span) * 12}px` }}
              title={
                spanKindLabel(span.kind)
                  ? `${spanKindLabel(span.kind)} · ${span.name}`
                  : span.name
              }
            >
              <StatusDot statusCode={span.statusCode} />
              <SpanKindIcon kind={span.kind} />
              <span className="truncate text-foreground">{span.name}</span>
            </div>

            <div className="relative h-3 flex-1 bg-muted/60">
              <div
                className="absolute top-0 h-3"
                style={{
                  background: spanColor(span),
                  left: `${left}%`,
                  width: `${width}%`
                }}
                title={`${span.name} — ${formatDuration(span.durationMs)}${
                  span.statusMessage ? ` — ${span.statusMessage}` : ''
                }`}
              />
            </div>

            <span className={cn('w-16 shrink-0 text-right', type.dataMuted)}>
              {formatDuration(span.durationMs)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TraceRow({ trace }: { trace: TraceSummary }): ReactElement {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border">
      <button
        aria-expanded={expanded}
        className={cn(
          traceRowGrid,
          focusRing,
          'w-full px-0 py-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/40'
        )}
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? (
          <ChevronDownIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        ) : (
          <ChevronRightIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        )}

        <StatusDot statusCode={trace.statusCode ?? 'unset'} />

        <span className={cn('min-w-0 truncate', type.rowPrimary)}>
          {trace.rootName ?? trace.traceId.slice(0, 12)}
        </span>

        <span className="text-xs font-medium text-destructive">
          {trace.errorCount > 0
            ? `${trace.errorCount} ${trace.errorCount === 1 ? 'error' : 'errors'}`
            : ''}
        </span>

        <span className={cn('text-right', type.data)}>
          {formatDuration(trace.durationMs)}
        </span>

        <span className={cn('hidden text-right sm:inline', type.dataMuted)}>
          {relativeTime(trace.startTime)}
        </span>
      </button>

      {expanded && <TraceWaterfall traceId={trace.traceId} />}
    </div>
  )
}

function TracesTab(): ReactElement {
  const [status, setStatus] = useState<'all' | 'error'>('all')
  const traces = useTraces({ status: status === 'error' ? 'error' : undefined })

  return (
    <div>
      <FilterLinks
        onChange={setStatus}
        options={[
          { label: 'All traces', value: 'all' },
          { label: 'With errors', value: 'error' }
        ]}
        value={status}
      />

      {traces.isLoading && (
        <p
          aria-live="polite"
          className={cn('mt-6', type.sectionHint)}
          role="status"
        >
          Fetching recent traces…
        </p>
      )}

      {!traces.isLoading && traces.data?.length === 0 && (
        <p className={cn('mt-6', type.sectionHint)}>
          No traces recorded yet. Browse the library, search, or play media to
          generate activity.
        </p>
      )}

      {traces.data && traces.data.length > 0 && (
        <div className="mt-6 border-t border-border">
          <div
            className={cn(
              traceRowGrid,
              'border-b border-border py-2.5'
            )}
          >
            <span aria-hidden />
            <span aria-hidden />
            <span className={type.caption}>Request</span>
            <span className={type.caption}>Status</span>
            <span className={cn('text-right', type.caption)}>Duration</span>
            <span className={cn('hidden text-right sm:inline', type.caption)}>
              Started
            </span>
          </div>

          {traces.data.map((trace) => (
            <TraceRow
              key={trace.traceId}
              trace={trace}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function normalizeStackFrame(line: string): string {
  return line
    .replace(/\?t=\d+/g, '')
    .replace(/:\d+:\d+/g, '')
    .replace(/:\d+\)?/g, ')')
    .trim()
}

function normalizeStack(stack: string | null): string {
  if (stack === null || stack.trim() === '') {
    return ''
  }

  return stack
    .split('\n')
    .slice(0, 8)
    .map(normalizeStackFrame)
    .join('\n')
}

function fingerprintError(error: TelemetryError): string {
  return JSON.stringify([
    error.source,
    error.kind,
    error.name,
    error.message,
    normalizeStack(error.stack)
  ])
}

interface GroupedTelemetryError {
  count: number
  fingerprint: string
  latest: TelemetryError
}

function groupErrors(errors: TelemetryError[]): GroupedTelemetryError[] {
  const groups = new Map<string, TelemetryError[]>()

  for (const error of errors) {
    const fingerprint = fingerprintError(error)
    const bucket = groups.get(fingerprint) ?? []

    bucket.push(error)
    groups.set(fingerprint, bucket)
  }

  return Array.from(groups.entries())
    .map(([fingerprint, bucket]) => {
      const sorted = [...bucket].sort(
        (first, second) => second.timestamp - first.timestamp
      )
      const latest = sorted[0]

      invariant(latest, 'Error group bucket is empty')

      return {
        count: sorted.length,
        fingerprint,
        latest
      }
    })
    .sort((first, second) => {
      if (second.count !== first.count) {
        return second.count - first.count
      }

      return second.latest.timestamp - first.latest.timestamp
    })
}

function formatTelemetryErrorForCopy(
  error: TelemetryError,
  count = 1
): string {
  const lines = count > 1 ? [`Count: ${count}`, ''] : []

  lines.push(
    `Name: ${error.name}`,
    `Message: ${error.message}`,
    `Source: ${error.source}`,
    `Kind: ${error.kind}`,
    `Time: ${new Date(error.timestamp).toISOString()}`
  )

  if (error.url) {
    lines.push(`URL: ${error.url}`)
  }

  if (error.traceId) {
    lines.push(`Trace ID: ${error.traceId}`)
  }

  if (error.spanId) {
    lines.push(`Span ID: ${error.spanId}`)
  }

  if (error.attributes !== '{}') {
    lines.push(`Attributes: ${error.attributes}`)
  }

  if (error.stack) {
    lines.push('', 'Stack:', error.stack)
  }

  return lines.join('\n')
}

async function copyTelemetryError(
  error: TelemetryError,
  count = 1
): Promise<void> {
  try {
    await navigator.clipboard.writeText(
      formatTelemetryErrorForCopy(error, count)
    )
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Copy failed. Check browser clipboard permissions.')
  }
}

function ErrorRow({
  count = 1,
  error
}: {
  count?: number
  error: TelemetryError
}): ReactElement {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border py-4 transition-colors hover:bg-muted/20">
      <div className={errorRowGrid}>
        <div
          className={cn(
            'pt-0.5 text-right tabular-nums',
            count > 1
              ? 'text-base font-semibold text-destructive'
              : 'text-sm text-muted-foreground'
          )}
        >
          {count}×
        </div>

        <div className="min-w-0">
          <p className={cn('break-words', type.rowPrimary)}>{error.message}</p>
          <p className={type.rowSecondary}>
            {error.name} · {error.source} · {error.kind} ·{' '}
            {count > 1
              ? `Last at ${formatClock(error.timestamp)}`
              : `At ${formatClock(error.timestamp)}`}
          </p>

          {error.url && (
            <p className={cn('mt-1 truncate', type.rowSecondary)}>{error.url}</p>
          )}

          {error.stack && (
            <>
              <button
                aria-expanded={expanded}
                className={cn(
                  focusRing,
                  'mt-2 min-h-11 rounded-md px-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
                )}
                onClick={() => setExpanded((value) => !value)}
                type="button"
              >
                {expanded ? 'Hide stack trace' : 'Show stack trace'}
              </button>
              {expanded && (
                <pre
                  className={cn(
                    'slim-scrollbar mt-3 max-h-64 overflow-auto rounded-md bg-muted/30 p-3 font-mono',
                    type.stack
                  )}
                >
                  {error.stack}
                </pre>
              )}
            </>
          )}
        </div>

        <button
          className={cn(
            focusRing,
            'min-h-11 justify-self-end self-start rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground active:bg-muted/60'
          )}
          onClick={() => {
            void copyTelemetryError(error, count)
          }}
          type="button"
        >
          Copy details
        </button>
      </div>
    </div>
  )
}

function ErrorsTab(): ReactElement {
  const errors = useTelemetryErrors()
  const groupedErrors = useMemo(
    () => groupErrors([...(errors.data ?? [])]),
    [errors.data]
  )

  return (
    <div>
      <p className={type.sectionHint}>
        Repeated errors are grouped. Most frequent appear first.
      </p>

      {errors.isLoading && (
        <p
          aria-live="polite"
          className={cn('mt-6', type.sectionHint)}
          role="status"
        >
          Fetching recent errors…
        </p>
      )}

      {!errors.isLoading && groupedErrors.length === 0 && (
        <p className={cn('mt-6', type.sectionHint)}>
          No errors recorded yet.
        </p>
      )}

      {groupedErrors.length > 0 && (
        <div className="mt-6 border-t border-border">
          <div
            className={cn(
              errorRowGrid,
              'border-b border-border py-2.5'
            )}
          >
            <span className={cn('text-right', type.caption)}>Times</span>
            <span className={type.caption}>Error</span>
            <span className={cn('text-right', type.caption)}>Copy</span>
          </div>

          {groupedErrors.map((group) => (
            <ErrorRow
              count={group.count}
              error={group.latest}
              key={group.fingerprint}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StatsTab(): ReactElement {
  const [windowMinutes, setWindowMinutes] = useState(60)
  const stats = useTelemetryStats(windowMinutes)

  const windows = [
    { label: 'Last 15 min', value: 15 },
    { label: 'Last hour', value: 60 },
    { label: 'Last 24 hours', value: 1_440 }
  ]

  const windowLabel =
    windows.find((option) => option.value === windowMinutes)?.label ??
    'this period'

  return (
    <div>
      <p className={type.sectionHint}>
        API response times and failure counts by route. Streaming routes are
        excluded — their duration reflects connection lifetime, not response
        time.
      </p>

      <div className="mt-4">
        <FilterLinks
          onChange={setWindowMinutes}
          options={windows}
          value={windowMinutes}
        />
      </div>

      {stats.isLoading && !stats.data && (
        <p
          aria-live="polite"
          className={cn('mt-6', type.sectionHint)}
          role="status"
        >
          Fetching route stats…
        </p>
      )}

      {stats.data && (
        <>
          <p className={cn('mt-6 leading-relaxed', type.sectionHint)}>
            <span className="font-medium tabular-nums text-foreground">
              {stats.data.totalRequests}
            </span>{' '}
            {stats.data.totalRequests === 1 ? 'request' : 'requests'} ·{' '}
            <span className="font-medium tabular-nums text-foreground">
              {stats.data.errorCount}
            </span>{' '}
            {stats.data.errorCount === 1 ? 'failure' : 'failures'} ·{' '}
            <span className="font-medium tabular-nums text-foreground">
              {(stats.data.errorRate * 100).toFixed(1)}%
            </span>{' '}
            failure rate
          </p>

          {stats.data.routes.length === 0 ? (
            <p className={cn('mt-6', type.sectionHint)}>
              No API requests in {windowLabel.toLowerCase()}. Try a longer time
              range, or use the app to generate traffic.
            </p>
          ) : (
            <div className="mt-6 border-t border-border">
              <div
                className={cn(
                  statsRowGrid,
                  'border-b border-border py-2.5'
                )}
              >
                <span className={type.caption}>Route</span>
                <span className={cn('text-right', type.caption)}>Requests</span>
                <span
                  className={cn('text-right', type.caption)}
                  title="Median response time"
                >
                  Median
                </span>
                <span
                  className={cn('text-right', type.caption)}
                  title="95th percentile response time"
                >
                  Slow
                </span>
                <span className={cn('text-right', type.caption)}>Failed</span>
              </div>

              {stats.data.routes.map((route) => (
                <div
                  className={cn(
                    statsRowGrid,
                    'border-b border-border py-3 transition-colors hover:bg-muted/20 last:border-b-0'
                  )}
                  key={route.route ?? '(unknown)'}
                >
                  <span className="truncate leading-snug">
                    {route.route ?? '(unknown)'}
                  </span>
                  <span className={cn('text-right', type.data)}>
                    {route.count}
                  </span>
                  <span className={cn('text-right', type.data)}>
                    {formatDuration(route.p50)}
                  </span>
                  <span className={cn('text-right', type.data)}>
                    {formatDuration(route.p95)}
                  </span>
                  <span
                    className={cn(
                      'text-right',
                      type.data,
                      route.errorCount > 0 && 'font-medium text-destructive'
                    )}
                  >
                    {route.errorCount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ObsPage(): ReactElement {
  const { tab: tabParam } = useParams<{ tab: string }>()

  if (!isTab(tabParam)) {
    return (
      <Navigate
        replace
        to="/obs/traces"
      />
    )
  }

  const tab = tabParam

  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <Link
          className={cn(
            focusRing,
            'inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 transition-colors hover:text-foreground',
            type.backLink
          )}
          to="/"
        >
          <ArrowLeft
            aria-hidden
            className="size-4"
          />
          Back to Jukebox
        </Link>

        <div className="mt-6">
          <h1 className={type.pageTitle}>Observability</h1>
          <p className={type.pageSubtitle}>
            Traces and errors from this server. Stored locally — nothing is sent
            elsewhere.
          </p>
        </div>

        <nav
          aria-label="Observability sections"
          className="-mb-px mt-8 flex gap-6 border-b border-border"
        >
          {tabs.map((entry) => (
            <NavLink
              aria-current={tab === entry.value ? 'page' : undefined}
              className={({ isActive }) =>
                cn(
                  type.tabBase,
                  '-mb-px',
                  isActive ? type.tabActive : type.tabInactive
                )
              }
              key={entry.value}
              to={`/obs/${entry.value}`}
            >
              {entry.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8">
          {tab === 'traces' && <TracesTab />}
          {tab === 'errors' && <ErrorsTab />}
          {tab === 'stats' && <StatsTab />}
        </div>
      </main>
    </div>
  )
}
