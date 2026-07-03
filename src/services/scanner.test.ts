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
  fetchMovieByExternalId: vi.fn().mockResolvedValue(null),
  fetchMovieMetadata: vi.fn().mockResolvedValue(null)
}))

const { scanLibrary } = await import('./scanner')
const { libraryUnreadableMessage } = await import('./library-validation')

let temporaryDirectory: string

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'jukebox-movie-scan-'))

  await testDb.db.delete(testDb.schema.subtitles)
  await testDb.db.delete(testDb.schema.movies)
})

afterEach(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true })
})

describe('scanLibrary', () => {
  it('rejects with the same actionable error as the show scanner for a missing root', async () => {
    const missing = join(temporaryDirectory, 'missing')

    await expect(scanLibrary(missing)).rejects.toThrow(
      libraryUnreadableMessage(missing)
    )
  })

  it('adds new movies on first scan and updates them on the next', async () => {
    await writeFile(join(temporaryDirectory, 'Heat (1995).mkv'), '')
    await mkdir(join(temporaryDirectory, 'Ronin'), { recursive: true })
    await writeFile(join(temporaryDirectory, 'Ronin', 'Ronin (1998).mkv'), '')

    const firstScan = await scanLibrary(temporaryDirectory)

    expect(firstScan).toEqual({ added: 2, updated: 0, total: 2 })

    const secondScan = await scanLibrary(temporaryDirectory)

    expect(secondScan).toEqual({ added: 0, updated: 2, total: 2 })

    const movies = await testDb.db.select().from(testDb.schema.movies)

    expect(movies).toHaveLength(2)
  })

  it('returns zero counts for an empty (but readable) library', async () => {
    expect(await scanLibrary(temporaryDirectory)).toEqual({
      added: 0,
      updated: 0,
      total: 0
    })
  })
})
