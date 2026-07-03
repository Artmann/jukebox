// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../database/test-database'

const testDb = createTestDatabase()

vi.mock('../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

vi.mock('./metadata', () => ({
  fetchSeasonMetadata: vi.fn().mockResolvedValue(null),
  fetchShowByExternalId: vi.fn().mockResolvedValue(null),
  fetchShowMetadata: vi.fn().mockResolvedValue(null)
}))

const { discoverShows, scanShowLibrary } = await import('./show-scanner')
const { libraryUnreadableMessage } = await import('./library-validation')

let temporaryDirectory: string

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'jukebox-show-scan-'))

  await testDb.db.delete(testDb.schema.subtitles)
  await testDb.db.delete(testDb.schema.episodes)
  await testDb.db.delete(testDb.schema.seasons)
  await testDb.db.delete(testDb.schema.shows)
})

afterEach(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true })
})

describe('discoverShows', () => {
  it('rejects with an actionable error for a missing library root', async () => {
    const missing = join(temporaryDirectory, 'missing')

    await expect(discoverShows(missing)).rejects.toThrow(
      libraryUnreadableMessage(missing)
    )
  })

  it('groups episodes under their show', async () => {
    const showFolder = join(temporaryDirectory, 'First Wave')
    const seasonFolder = join(showFolder, 'Season 1')

    await mkdir(seasonFolder, { recursive: true })
    await writeFile(join(seasonFolder, 'First Wave S01E01.mkv'), '')
    await writeFile(join(seasonFolder, 'First Wave S01E02.mkv'), '')

    const shows = await discoverShows(temporaryDirectory)

    expect(shows).toHaveLength(1)
    expect(shows[0]?.name).toEqual('First Wave')
    expect(shows[0]?.episodes).toHaveLength(2)
  })
})

describe('scanShowLibrary', () => {
  it('rejects with an actionable error for a missing library root', async () => {
    const missing = join(temporaryDirectory, 'missing')

    await expect(scanShowLibrary(missing)).rejects.toThrow(
      libraryUnreadableMessage(missing)
    )
  })

  it('adds new episodes on first scan and updates them on the next', async () => {
    const seasonFolder = join(temporaryDirectory, 'First Wave', 'Season 1')

    await mkdir(seasonFolder, { recursive: true })
    await writeFile(join(seasonFolder, 'First Wave S01E01.mkv'), '')
    await writeFile(join(seasonFolder, 'First Wave S01E02.mkv'), '')

    const firstScan = await scanShowLibrary(temporaryDirectory)

    expect(firstScan).toEqual({ added: 2, updated: 0, total: 2 })

    const secondScan = await scanShowLibrary(temporaryDirectory)

    expect(secondScan).toEqual({ added: 0, updated: 2, total: 2 })

    const episodes = await testDb.db.select().from(testDb.schema.episodes)

    expect(episodes).toHaveLength(2)
  })

  it('returns zero counts for an empty (but readable) library', async () => {
    expect(await scanShowLibrary(temporaryDirectory)).toEqual({
      added: 0,
      updated: 0,
      total: 0
    })
  })
})
