// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestDatabase } from '../database/test-database'
import { reconcileShowLibrary } from './show-reconciliation'

const testDb = createTestDatabase()

const timestamp = new Date('2026-07-01T10:00:00Z')

let temporaryDirectory: string

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'jukebox-reconcile-'))

  await testDb.db.delete(testDb.schema.subtitles)
  await testDb.db.delete(testDb.schema.watchProgress)
  await testDb.db.delete(testDb.schema.favorites)
  await testDb.db.delete(testDb.schema.episodes)
  await testDb.db.delete(testDb.schema.seasons)
  await testDb.db.delete(testDb.schema.shows)
  await testDb.db.delete(testDb.schema.profiles)
  await testDb.db.delete(testDb.schema.libraries)
})

afterEach(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true })
})

interface InsertedShow {
  episodeId: number
  showId: number
}

async function insertShowWithEpisode(
  title: string,
  folderPath: string,
  episodeFilePath: string
): Promise<InsertedShow> {
  const insertedShow = await testDb.db
    .insert(testDb.schema.shows)
    .values({
      createdAt: timestamp,
      folderPath,
      title,
      updatedAt: timestamp
    })
    .returning({ id: testDb.schema.shows.id })
  const showId = insertedShow[0]?.id ?? 0

  const insertedSeason = await testDb.db
    .insert(testDb.schema.seasons)
    .values({ seasonNumber: 1, showId })
    .returning({ id: testDb.schema.seasons.id })

  const insertedEpisode = await testDb.db
    .insert(testDb.schema.episodes)
    .values({
      createdAt: timestamp,
      episodeNumber: 1,
      fileName: 'S01E01.mkv',
      filePath: episodeFilePath,
      seasonId: insertedSeason[0]?.id ?? 0,
      seasonNumber: 1,
      showId,
      title: 'Episode 1',
      updatedAt: timestamp
    })
    .returning({ id: testDb.schema.episodes.id })

  return { episodeId: insertedEpisode[0]?.id ?? 0, showId }
}

describe('reconcileShowLibrary', () => {
  it('skips duplicates that live under a configured library whose root is unreadable', async () => {
    const scannedLibrary = join(temporaryDirectory, 'library-one')
    const unpluggedLibrary = join(temporaryDirectory, 'unplugged')

    const scannedEpisodePath = join(
      scannedLibrary,
      'Top Chef',
      'Season 1',
      'Top Chef S01E01.mkv'
    )

    await mkdir(join(scannedLibrary, 'Top Chef', 'Season 1'), {
      recursive: true
    })
    await writeFile(scannedEpisodePath, '')

    const scannedShow = await insertShowWithEpisode(
      'Top Chef',
      join(scannedLibrary, 'Top Chef'),
      scannedEpisodePath
    )

    // The duplicate sits under a configured show library whose root doesn't
    // exist right now — an unplugged drive. Its files all look missing, but
    // it must not be merged away.
    const offlineShow = await insertShowWithEpisode(
      'Top Chef',
      join(unpluggedLibrary, 'Top Chef'),
      join(unpluggedLibrary, 'Top Chef', 'Season 1', 'Top Chef S01E01.mkv')
    )

    await testDb.db.insert(testDb.schema.libraries).values([
      {
        createdAt: timestamp,
        name: 'Library One',
        path: scannedLibrary,
        type: 'shows'
      },
      {
        createdAt: timestamp,
        name: 'Unplugged',
        path: unpluggedLibrary,
        type: 'shows'
      }
    ])

    const result = await reconcileShowLibrary(testDb.db, scannedLibrary, [
      scannedShow.showId
    ])

    expect(result).toEqual({
      removedEpisodes: 0,
      removedSeasons: 0,
      removedShows: 0
    })

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows.map((show) => show.id).sort()).toEqual(
      [scannedShow.showId, offlineShow.showId].sort()
    )
  })

  it('merges the duplicate once its library root is readable but the files are gone', async () => {
    const scannedLibrary = join(temporaryDirectory, 'library-one')
    const otherLibrary = join(temporaryDirectory, 'other')

    const scannedEpisodePath = join(
      scannedLibrary,
      'Top Chef',
      'Season 1',
      'Top Chef S01E01.mkv'
    )

    await mkdir(join(scannedLibrary, 'Top Chef', 'Season 1'), {
      recursive: true
    })
    await writeFile(scannedEpisodePath, '')

    // The other library root exists (readable) but the duplicate's files
    // don't — a genuine leftover that should be merged away.
    await mkdir(otherLibrary, { recursive: true })

    const scannedShow = await insertShowWithEpisode(
      'Top Chef',
      join(scannedLibrary, 'Top Chef'),
      scannedEpisodePath
    )

    const staleShow = await insertShowWithEpisode(
      'Top Chef',
      join(otherLibrary, 'Top Chef'),
      join(otherLibrary, 'Top Chef', 'Season 1', 'Top Chef S01E01.mkv')
    )

    await testDb.db.insert(testDb.schema.libraries).values([
      {
        createdAt: timestamp,
        name: 'Library One',
        path: scannedLibrary,
        type: 'shows'
      },
      {
        createdAt: timestamp,
        name: 'Other',
        path: otherLibrary,
        type: 'shows'
      }
    ])

    const insertedProfile = await testDb.db
      .insert(testDb.schema.profiles)
      .values({ createdAt: timestamp, emoji: '🍿', name: 'Art' })
      .returning({ id: testDb.schema.profiles.id })
    const profileId = insertedProfile[0]?.id ?? 0

    await testDb.db.insert(testDb.schema.watchProgress).values({
      currentTime: 600,
      duration: 2600,
      episodeId: staleShow.episodeId,
      profileId,
      updatedAt: timestamp
    })

    const result = await reconcileShowLibrary(testDb.db, scannedLibrary, [
      scannedShow.showId
    ])

    expect(result).toEqual({
      removedEpisodes: 1,
      removedSeasons: 1,
      removedShows: 1
    })

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows.map((show) => show.id)).toEqual([scannedShow.showId])

    const progress = await testDb.db
      .select({
        currentTime: testDb.schema.watchProgress.currentTime,
        episodeId: testDb.schema.watchProgress.episodeId
      })
      .from(testDb.schema.watchProgress)

    expect(progress).toEqual([
      { currentTime: 600, episodeId: scannedShow.episodeId }
    ])
  })

  it('re-points favorites from a merged duplicate to the surviving show', async () => {
    const scannedLibrary = join(temporaryDirectory, 'library-one')

    const scannedEpisodePath = join(
      scannedLibrary,
      'Top Chef',
      'Season 1',
      'Top Chef S01E01.mkv'
    )

    await mkdir(join(scannedLibrary, 'Top Chef', 'Season 1'), {
      recursive: true
    })
    await writeFile(scannedEpisodePath, '')

    const scannedShow = await insertShowWithEpisode(
      'Top Chef',
      join(scannedLibrary, 'Top Chef'),
      scannedEpisodePath
    )

    const deadFolder = join(temporaryDirectory, 'gone', 'Top Chef')
    const staleShow = await insertShowWithEpisode(
      'Top Chef',
      deadFolder,
      join(deadFolder, 'Season 1', 'Top Chef S01E01.mkv')
    )

    const insertedProfile = await testDb.db
      .insert(testDb.schema.profiles)
      .values({ createdAt: timestamp, emoji: '🍿', name: 'Art' })
      .returning({ id: testDb.schema.profiles.id })
    const profileId = insertedProfile[0]?.id ?? 0

    await testDb.db.insert(testDb.schema.favorites).values({
      createdAt: timestamp,
      profileId,
      showId: staleShow.showId
    })

    await reconcileShowLibrary(testDb.db, scannedLibrary, [
      scannedShow.showId
    ])

    const favorites = await testDb.db
      .select({
        profileId: testDb.schema.favorites.profileId,
        showId: testDb.schema.favorites.showId
      })
      .from(testDb.schema.favorites)

    expect(favorites).toEqual([{ profileId, showId: scannedShow.showId }])
  })
})
