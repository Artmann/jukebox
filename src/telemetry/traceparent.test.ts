import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { formatTraceparent, parseTraceparent } from './traceparent'

const traceId = '0af7651916cd43dd8448eb211c80319c'
const spanId = 'b7ad6b7169203331'

describe('parseTraceparent', () => {
  it('parses a valid sampled header', () => {
    expect(parseTraceparent(`00-${traceId}-${spanId}-01`)).toEqual(
      Option.some({ sampled: true, spanId, traceId })
    )
  })

  it('reports an unsampled header', () => {
    expect(parseTraceparent(`00-${traceId}-${spanId}-00`)).toEqual(
      Option.some({ sampled: false, spanId, traceId })
    )
  })

  it('rejects a missing value', () => {
    expect(parseTraceparent(undefined)).toEqual(Option.none())
    expect(parseTraceparent(null)).toEqual(Option.none())
  })

  it('rejects an unknown version', () => {
    expect(parseTraceparent(`01-${traceId}-${spanId}-01`)).toEqual(
      Option.none()
    )
  })

  it('rejects malformed ids', () => {
    expect(parseTraceparent(`00-${traceId}-short-01`)).toEqual(Option.none())
    expect(parseTraceparent(`00-nothex-${spanId}-01`)).toEqual(Option.none())
  })

  it('rejects all-zero ids', () => {
    expect(parseTraceparent(`00-${'0'.repeat(32)}-${spanId}-01`)).toEqual(
      Option.none()
    )
    expect(parseTraceparent(`00-${traceId}-${'0'.repeat(16)}-01`)).toEqual(
      Option.none()
    )
  })

  it('round-trips through formatTraceparent', () => {
    const parent = { sampled: true, spanId, traceId }

    expect(parseTraceparent(formatTraceparent(parent))).toEqual(
      Option.some(parent)
    )
  })
})
