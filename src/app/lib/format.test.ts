import { describe, expect, it } from 'vitest'

import { formatTime } from './format'

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toEqual('00:00')
  })

  it('formats seconds only', () => {
    expect(formatTime(5)).toEqual('00:05')
    expect(formatTime(45)).toEqual('00:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatTime(60)).toEqual('01:00')
    expect(formatTime(90)).toEqual('01:30')
    expect(formatTime(625)).toEqual('10:25')
  })

  it('omits hours when under one hour', () => {
    expect(formatTime(3599)).toEqual('59:59')
  })

  it('includes hours when one hour or more', () => {
    expect(formatTime(3600)).toEqual('01:00:00')
    expect(formatTime(3661)).toEqual('01:01:01')
  })

  it('formats multi-hour durations', () => {
    expect(formatTime(7384)).toEqual('02:03:04')
  })

  it('pads single digits', () => {
    expect(formatTime(61)).toEqual('01:01')
    expect(formatTime(3601)).toEqual('01:00:01')
  })

  it('handles fractional seconds by flooring', () => {
    expect(formatTime(90.7)).toEqual('01:30')
    expect(formatTime(59.9)).toEqual('00:59')
  })
})
