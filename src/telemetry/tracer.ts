import { Cause, Context, Exit, Option, Tracer } from 'effect'

import type { NewSpanRow } from './schema'

declare const Bun: unknown
declare const JUKEBOX_BUILD_VERSION: string | undefined

const nanosecondsPerMillisecond = 1_000_000n

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)

  crypto.getRandomValues(bytes)

  let result = ''

  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0')
  }

  return result
}

function toMillis(nanoseconds: bigint): number {
  return Number(nanoseconds / nanosecondsPerMillisecond)
}

function buildResource(): string {
  const runtime = typeof Bun !== 'undefined' ? 'bun' : 'node'
  const version =
    typeof JUKEBOX_BUILD_VERSION === 'string' && JUKEBOX_BUILD_VERSION.length > 0
      ? JUKEBOX_BUILD_VERSION
      : 'unknown'

  return JSON.stringify({
    'process.pid': process.pid,
    'process.runtime': runtime,
    'service.name': 'jukebox',
    'service.version': version
  })
}

interface FailureDescription {
  message: string
  name: string
  stack: string | null
}

function describeError(error: unknown, cause: Cause.Cause<unknown>): FailureDescription {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack ?? null }
  }

  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const name = typeof record['_tag'] === 'string' ? record['_tag'] : 'Error'
    const message =
      typeof record['message'] === 'string'
        ? record['message']
        : Cause.pretty(cause)

    return { message, name, stack: null }
  }

  return { message: Cause.pretty(cause), name: 'Error', stack: null }
}

function describeFailure(cause: Cause.Cause<unknown>): FailureDescription {
  const failure = Cause.failureOption(cause)

  if (Option.isSome(failure)) {
    return describeError(failure.value, cause)
  }

  const defect = Cause.dieOption(cause)

  if (Option.isSome(defect)) {
    return describeError(defect.value, cause)
  }

  return { message: Cause.pretty(cause), name: 'Error', stack: null }
}

interface RecordedEvent {
  attributes: Record<string, unknown>
  name: string
  time: number
}

// A span that writes itself into the telemetry buffer when it ends. Mirrors
// Effect's built-in NativeSpan (see effect/internal/tracer) but, instead of just
// recording an in-memory status, serializes the finished span to a NewSpanRow
// and hands it to the writer's synchronous `enqueue`.
class SqliteSpan implements Tracer.Span {
  readonly _tag = 'Span'

  readonly attributes = new Map<string, unknown>()
  readonly kind: Tracer.SpanKind
  readonly links: Tracer.SpanLink[]
  readonly name: string
  readonly parent: Option.Option<Tracer.AnySpan>
  readonly parentSpanId: string | null
  readonly sampled: boolean
  readonly spanId: string
  readonly traceId: string

  status: Tracer.SpanStatus

  private readonly events: RecordedEvent[] = []

  constructor(
    name: string,
    parent: Option.Option<Tracer.AnySpan>,
    readonly context: Context.Context<never>,
    links: ReadonlyArray<Tracer.SpanLink>,
    startTime: bigint,
    kind: Tracer.SpanKind,
    private readonly enqueue: (record: NewSpanRow) => void,
    private readonly resource: string,
    private readonly sessionId: string
  ) {
    this.name = name
    this.parent = parent
    this.kind = kind
    this.links = Array.from(links)
    this.status = { _tag: 'Started', startTime }
    this.traceId = Option.isSome(parent) ? parent.value.traceId : randomHex(16)
    this.spanId = randomHex(8)
    this.parentSpanId = Option.isSome(parent) ? parent.value.spanId : null
    this.sampled = Option.isSome(parent) ? parent.value.sampled : true
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    this.links.push(...links)
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value)
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    const startTime = this.status.startTime

    this.status = { _tag: 'Ended', endTime, exit, startTime }

    let statusCode: NewSpanRow['statusCode'] = 'ok'
    let statusMessage: string | null = null

    if (Exit.isFailure(exit)) {
      // A cancelled operation (SSE connection closed, shutdown) is not an error.
      if (Cause.isInterruptedOnly(exit.cause)) {
        statusCode = 'unset'
      } else {
        statusCode = 'error'

        const failure = describeFailure(exit.cause)

        statusMessage = failure.message

        this.events.push({
          attributes: {
            'exception.message': failure.message,
            'exception.type': failure.name,
            ...(failure.stack === null
              ? {}
              : { 'exception.stacktrace': failure.stack })
          },
          name: 'exception',
          time: toMillis(endTime)
        })
      }
    }

    const attributesObject = Object.fromEntries(this.attributes)
    const route =
      typeof attributesObject['http.route'] === 'string'
        ? attributesObject['http.route']
        : null

    this.enqueue({
      attributes: JSON.stringify(attributesObject),
      createdAt: toMillis(endTime),
      durationMs: Number(endTime - startTime) / Number(nanosecondsPerMillisecond),
      endTime: toMillis(endTime),
      events: JSON.stringify(this.events),
      kind: this.kind,
      name: this.name,
      parentSpanId: this.parentSpanId,
      resource: this.resource,
      route,
      sessionId: this.sessionId,
      source: 'backend',
      spanId: this.spanId,
      startTime: toMillis(startTime),
      statusCode,
      statusMessage,
      traceId: this.traceId
    })
  }

  event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void {
    this.events.push({
      attributes: attributes ?? {},
      name,
      time: toMillis(startTime)
    })
  }
}

// Build an Effect tracer that records finished spans into the telemetry buffer.
// Instrumentation still uses the standard `Effect.withSpan` API — this only
// changes where spans are sent, so swapping in `@effect/opentelemetry` later
// would not touch a single handler.
export function makeSqliteTracer(
  enqueue: (record: NewSpanRow) => void
): Tracer.Tracer {
  const resource = buildResource()
  const sessionId = randomHex(8)

  return Tracer.make({
    span: (name, parent, context, links, startTime, kind) =>
      new SqliteSpan(
        name,
        parent,
        context,
        links,
        startTime,
        kind,
        enqueue,
        resource,
        sessionId
      ),
    context: (execute) => execute()
  })
}
