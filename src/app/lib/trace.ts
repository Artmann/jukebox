// W3C trace-context id helpers for the browser. A traceId is 16 random bytes
// (32 hex chars), a spanId is 8 random bytes (16 hex chars) — the same shape the
// backend tracer produces, so a frontend span and the backend span it triggers
// share one trace.

import { randomHex } from '../../lib/random-hex'

export function generateTraceId(): string {
  return randomHex(16)
}

export function generateSpanId(): string {
  return randomHex(8)
}

// `version-traceId-spanId-flags`; flags `01` marks the trace as sampled.
export function buildTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`
}
