import { buildTraceparent, generateSpanId, generateTraceId } from './trace'

// Browser-side telemetry: patches window.fetch to propagate a W3C traceparent
// on every /api call (so the backend continues the browser's trace) and records
// a client span per call, and captures uncaught errors + unhandled rejections.
// Everything is buffered and flushed to POST /api/telemetry, where the backend
// writes it into the local telemetry database. Nothing leaves the machine.

interface SpanEvent {
  attributes?: Record<string, unknown>
  name: string
  time: number
}

interface FrontendSpan {
  attributes?: Record<string, unknown>
  endTime: number
  events?: SpanEvent[]
  kind?: 'client' | 'consumer' | 'internal' | 'producer' | 'server'
  name: string
  parentSpanId?: string
  spanId: string
  startTime: number
  statusCode?: 'error' | 'ok' | 'unset'
  statusMessage?: string
  traceId: string
}

interface FrontendError {
  kind: 'console' | 'exception' | 'http' | 'unhandledrejection'
  message: string
  name: string
  spanId?: string
  stack?: string
  timestamp: number
  traceId?: string
  url?: string
}

const maxSpans = 200
const maxErrors = 100
const flushIntervalMs = 5_000
const ingestPath = '/api/telemetry'

const spanBuffer: FrontendSpan[] = []
const errorBuffer: FrontendError[] = []
const sessionId = generateSpanId()

let installed = false
let originalFetch: typeof fetch

function recordSpan(span: FrontendSpan): void {
  if (spanBuffer.length < maxSpans) {
    spanBuffer.push(span)
  }
}

function recordError(error: FrontendError): void {
  if (errorBuffer.length < maxErrors) {
    errorBuffer.push(error)
  }
}

function resource(): Record<string, unknown> {
  return {
    'browser.userAgent': navigator.userAgent,
    'service.name': 'jukebox-web',
    url: window.location.href
  }
}

function flush(useBeacon: boolean): void {
  if (spanBuffer.length === 0 && errorBuffer.length === 0) {
    return
  }

  const payload = {
    errors: errorBuffer.splice(0, maxErrors),
    resource: resource(),
    sessionId,
    spans: spanBuffer.splice(0, maxSpans)
  }
  const body = JSON.stringify(payload)

  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(
      ingestPath,
      new Blob([body], { type: 'application/json' })
    )

    return
  }

  // originalFetch (not the patched one) so ingesting never traces itself.
  void originalFetch(ingestPath, {
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST'
  }).catch(() => {
    // Best effort: a failed flush drops this batch rather than growing forever.
  })
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method !== undefined) {
    return init.method
  }

  if (input instanceof Request) {
    return input.method
  }

  return 'GET'
}

function shouldTrace(path: string): boolean {
  return path.startsWith('/api') && !path.startsWith('/api/telemetry')
}

// Adds the traceparent header to an outgoing request without mutating the
// caller's objects.
function withTraceparent(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  traceparent: string
): { input: RequestInfo | URL; init: RequestInit | undefined } {
  if (input instanceof Request && init === undefined) {
    const headers = new Headers(input.headers)

    headers.set('traceparent', traceparent)

    return { init, input: new Request(input, { headers }) }
  }

  const headers = new Headers(init?.headers)

  headers.set('traceparent', traceparent)

  return { init: { ...init, headers }, input }
}

async function tracedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = requestUrl(input)
  const path = new URL(url, window.location.origin).pathname

  if (!shouldTrace(path)) {
    return originalFetch(input, init)
  }

  const traceId = generateTraceId()
  const spanId = generateSpanId()
  const method = requestMethod(input, init)
  const startTime = Date.now()
  const patched = withTraceparent(input, init, buildTraceparent(traceId, spanId))

  try {
    const response = await originalFetch(patched.input, patched.init)

    recordSpan({
      attributes: {
        'http.method': method,
        'http.route': path,
        'http.status_code': response.status
      },
      endTime: Date.now(),
      kind: 'client',
      name: `${method} ${path}`,
      spanId,
      startTime,
      statusCode: response.ok ? 'ok' : 'error',
      statusMessage: response.ok ? undefined : `HTTP ${response.status}`,
      traceId
    })

    if (!response.ok) {
      recordError({
        kind: 'http',
        message: `${method} ${path} responded with ${response.status}.`,
        name: `HTTP ${response.status}`,
        spanId,
        timestamp: Date.now(),
        traceId,
        url: path
      })
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    recordSpan({
      attributes: { 'http.method': method, 'http.route': path },
      endTime: Date.now(),
      kind: 'client',
      name: `${method} ${path}`,
      spanId,
      startTime,
      statusCode: 'error',
      statusMessage: message,
      traceId
    })
    recordError({
      kind: 'exception',
      message,
      name: error instanceof Error ? error.name : 'FetchError',
      spanId,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: Date.now(),
      traceId,
      url: path
    })

    throw error
  }
}

// Call once, before the app renders. Safe to call more than once.
export function installTelemetry(): void {
  if (installed || typeof window === 'undefined') {
    return
  }

  installed = true
  originalFetch = window.fetch.bind(window)
  window.fetch = tracedFetch

  window.addEventListener('error', (event) => {
    recordError({
      kind: 'exception',
      message: event.message,
      name: event.error instanceof Error ? event.error.name : 'Error',
      stack: event.error instanceof Error ? event.error.stack : undefined,
      timestamp: Date.now(),
      url: window.location.href
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason

    recordError({
      kind: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason),
      name: reason instanceof Error ? reason.name : 'UnhandledRejection',
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: Date.now(),
      url: window.location.href
    })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush(true)
    }
  })

  window.addEventListener('pagehide', () => flush(true))

  window.setInterval(() => flush(false), flushIntervalMs)
}
