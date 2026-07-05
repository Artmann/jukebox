// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { parseRange } from './video-stream'

describe('parseRange', () => {
  it('parses a bounded range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({
      chunkSize: 100,
      end: 99,
      start: 0
    })
  })

  it('defaults an open-ended range to the last byte', () => {
    expect(parseRange('bytes=500-', 1000)).toEqual({
      chunkSize: 500,
      end: 999,
      start: 500
    })
  })

  it('throws the actionable message for a header without a start', () => {
    expect(() => parseRange('bytes=-500', 1000)).toThrow(
      'Invalid Range header'
    )
  })
})
