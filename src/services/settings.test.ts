// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../database/test-database'

const testDb = createTestDatabase()

vi.mock('../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

vi.mock('../config', () => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn()
}))

const { getConfig, saveConfig } = await import('../config')
const {
  getSetting,
  getTmdbApiKey,
  isScanScheduleValue,
  setSetting,
  setTmdbApiKey,
  tmdbApiKeySettingKey
} = await import('./settings')

async function reset() {
  await testDb.db.delete(testDb.schema.settings)
}

beforeEach(async () => {
  await reset()
  vi.mocked(getConfig).mockReset()
  vi.mocked(saveConfig).mockReset()
  vi.mocked(saveConfig).mockResolvedValue(undefined)
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
})

describe('getTmdbApiKey', () => {
  it('returns null when nothing is configured', async () => {
    vi.mocked(getConfig).mockReturnValue(null)

    expect(await getTmdbApiKey(testDb.db)).toEqual(null)
  })

  it('returns the DB value when present', async () => {
    await setSetting(tmdbApiKeySettingKey, 'from-db', testDb.db)
    vi.mocked(getConfig).mockReturnValue({ tmdbApiKey: 'from-json' })

    expect(await getTmdbApiKey(testDb.db)).toEqual('from-db')
  })

  it('migrates a JSON-only key into the DB on first call', async () => {
    vi.mocked(getConfig).mockReturnValue({ tmdbApiKey: 'legacy-key' })

    const first = await getTmdbApiKey(testDb.db)

    expect(first).toEqual('legacy-key')
    expect(await getSetting(tmdbApiKeySettingKey, testDb.db)).toEqual(
      'legacy-key'
    )
  })

  it('ignores the JSON config once the DB has a value', async () => {
    vi.mocked(getConfig).mockReturnValue({ tmdbApiKey: 'legacy-key' })
    await getTmdbApiKey(testDb.db)

    vi.mocked(getConfig).mockReturnValue({ tmdbApiKey: 'stale-legacy' })
    await setSetting(tmdbApiKeySettingKey, 'new-db-key', testDb.db)

    expect(await getTmdbApiKey(testDb.db)).toEqual('new-db-key')
  })
})

describe('setTmdbApiKey', () => {
  it('writes to the DB and mirrors to the JSON config', async () => {
    await setTmdbApiKey('my-key', testDb.db)

    expect(await getSetting(tmdbApiKeySettingKey, testDb.db)).toEqual(
      'my-key'
    )
    expect(saveConfig).toHaveBeenCalledWith({ tmdbApiKey: 'my-key' })
  })

  it('succeeds even when the JSON write fails', async () => {
    vi.mocked(saveConfig).mockRejectedValue(new Error('read only fs'))

    await expect(setTmdbApiKey('my-key', testDb.db)).resolves.toEqual(
      undefined
    )
    expect(await getSetting(tmdbApiKeySettingKey, testDb.db)).toEqual('my-key')
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
