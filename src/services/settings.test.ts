// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase } from '../database/test-database'

const testDb = createTestDatabase()

import {
  getSetting,
  isScanScheduleValue,
  setSetting
} from './settings'

async function reset() {
  await testDb.db.delete(testDb.schema.settings)
}

beforeEach(async () => {
  await reset()
})

describe('getSetting', () => {
  it('returns null when key is not set', async () => {
    const value = await getSetting('does-not-exist', testDb.db)

    expect(value).toEqual(null)
  })

  it('returns the stored value', async () => {
    await setSetting('foo', 'bar', testDb.db)

    expect(await getSetting('foo', testDb.db)).toEqual('bar')
  })
})

describe('setSetting', () => {
  it('inserts a new key', async () => {
    await setSetting('scanSchedule', '6h', testDb.db)

    expect(await getSetting('scanSchedule', testDb.db)).toEqual('6h')
  })

  it('updates an existing key', async () => {
    await setSetting('scanSchedule', '6h', testDb.db)
    await setSetting('scanSchedule', '24h', testDb.db)

    expect(await getSetting('scanSchedule', testDb.db)).toEqual('24h')
  })

  it('handles concurrent writes without UNIQUE constraint errors', async () => {
    await Promise.all([
      setSetting('scanSchedule', '6h', testDb.db),
      setSetting('scanSchedule', '24h', testDb.db)
    ])

    const stored = await getSetting('scanSchedule', testDb.db)

    expect(['6h', '24h']).toContain(stored)
  })
})

describe('isScanScheduleValue', () => {
  it('accepts known values', () => {
    expect(isScanScheduleValue('off')).toEqual(true)
    expect(isScanScheduleValue('6h')).toEqual(true)
    expect(isScanScheduleValue('12h')).toEqual(true)
    expect(isScanScheduleValue('24h')).toEqual(true)
  })

  it('rejects unknown values', () => {
    expect(isScanScheduleValue('hourly')).toEqual(false)
    expect(isScanScheduleValue('')).toEqual(false)
  })
})
