import { Option } from 'effect'

export interface TraceParent {
  sampled: boolean
  spanId: string
  traceId: string
}

const traceIdPattern = /^[0-9a-f]{32}$/
const spanIdPattern = /^[0-9a-f]{16}$/
const allZeroTraceId = '0'.repeat(32)
const allZeroSpanId = '0'.repeat(16)

// Parse a W3C `traceparent` header: `version-traceId-spanId-flags`, e.g.
// `00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01`. Returns None when
// the value is missing or malformed so a bad header simply starts a fresh trace
// instead of corrupting one. Only version `00` is recognized (the only version
// defined by the spec today).
export function parseTraceparent(
  value: string | null | undefined
): Option.Option<TraceParent> {
  if (value === null || value === undefined) {
    return Option.none()
  }

  const parts = value.trim().split('-')

  if (parts.length !== 4) {
    return Option.none()
  }

  const [version, traceId, spanId, flags] = parts

  if (
    version === undefined ||
    traceId === undefined ||
    spanId === undefined ||
    flags === undefined
  ) {
    return Option.none()
  }

  if (version !== '00') {
    return Option.none()
  }

  if (!traceIdPattern.test(traceId) || traceId === allZeroTraceId) {
    return Option.none()
  }

  if (!spanIdPattern.test(spanId) || spanId === allZeroSpanId) {
    return Option.none()
  }

  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return Option.none()
  }

  const sampled = (Number.parseInt(flags, 16) & 1) === 1

  return Option.some({ sampled, spanId, traceId })
}

// Build a W3C `traceparent` header from its parts.
export function formatTraceparent(parent: TraceParent): string {
  const flags = parent.sampled ? '01' : '00'

  return `00-${parent.traceId}-${parent.spanId}-${flags}`
}
