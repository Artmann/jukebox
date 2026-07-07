// W3C trace-context id helpers for the browser. A traceId is 16 random bytes
// (32 hex chars), a spanId is 8 random bytes (16 hex chars) — the same shape the
// backend tracer produces, so a frontend span and the backend span it triggers
// share one trace.

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)

  crypto.getRandomValues(bytes)

  let result = ''

  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0')
  }

  return result
}

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
