// @vitest-environment node
import { mkdir, mkdtemp, rename, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { databaseTestLayer } from '../database/layer'
import { createTestDatabase } from '../database/test-database'
import { libraryUnreadableMessage } from './library-validation'
import { Metadata } from './metadata'
import { discoverShows, ShowScanner } from './show-scanner'

const testDb = createTestDatabase()

// Metadata is stubbed to always miss so scans use the parsed filename data and
// never make a real HTTP request. Provided in place of the baked-in
// Metadata.Default via ShowScanner.DefaultWithoutDependencies.
const metadataStub = Layer.succeed(Metadata, {
  fetchMovieByExternalId: () => Effect.succeed(null),
  fetchMovieMetadata: () => Effect.succeed(null),
  fetchSeasonMetadata: () => Effect.succeed(null),
  fetchShowByExternalId: () => Effect.succeed(null),
  fetchShowMetadata: () => Effect.succeed(null)
} as unknown as Metadata)

const showScannerLayer = ShowScanner.DefaultWithoutDependencies.pipe(
  Layer.provide(metadataStub),
  Layer.provide(databaseTestLayer(testDb.db))
)

const scanShowLibrary = (path: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const showScanner = yield* ShowScanner

      return yield* showScanner.scanShowLibrary(path)
    }).pipe(Effect.provide(showScannerLayer))
  )

let temporaryDirectory: string

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'jukebox-show-scan-'))

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

describe('moved and duplicated show folders', () => {
  const progressTimestamp = new Date('2026-07-01T10:00:00Z')

  async function createEpisodeFile(...segments: string[]): Promise<string> {
    const filePath = join(...segments)

    await mkdir(join(...segments.slice(0, -1)), { recursive: true })
    await writeFile(filePath, '')

    return filePath
  }

  async function createProfile(): Promise<number> {
    const inserted = await testDb.db
      .insert(testDb.schema.profiles)
      .values({ createdAt: progressTimestamp, emoji: '🍿', name: 'Art' })
      .returning({ id: testDb.schema.profiles.id })

    const profileId = inserted[0]?.id

    if (profileId === undefined) {
      throw new Error('Failed to insert test profile.')
    }

    return profileId
  }

  it('keeps a single show with both seasons and watch progress after the show folder moves', async () => {
    const libraryOne = join(temporaryDirectory, 'library-one')
    const libraryTwo = join(temporaryDirectory, 'library-two')

    await createEpisodeFile(
      libraryOne,
      'Top Chef',
      'Season 1',
      'Top Chef S01E01.mkv'
    )
    await scanShowLibrary(libraryOne)

    const showsAfterFirstScan = await testDb.db
      .select()
      .from(testDb.schema.shows)
    const originalShowId = showsAfterFirstScan[0]?.id

    const profileId = await createProfile()
    const scannedEpisodes = await testDb.db
      .select()
      .from(testDb.schema.episodes)
    const originalEpisodeId = scannedEpisodes[0]?.id ?? 0

    const insertedProgress = await testDb.db
      .insert(testDb.schema.watchProgress)
      .values({
        currentTime: 900,
        duration: 2600,
        episodeId: originalEpisodeId,
        profileId,
        updatedAt: progressTimestamp
      })
      .returning({ id: testDb.schema.watchProgress.id })

    // The user's scenario: move the whole show folder into another library
    // and add a second season there.
    await mkdir(libraryTwo, { recursive: true })
    await rename(join(libraryOne, 'Top Chef'), join(libraryTwo, 'Top Chef'))
    await createEpisodeFile(
      libraryTwo,
      'Top Chef',
      'Season 2',
      'Top Chef S02E01.mkv'
    )

    await scanShowLibrary(libraryTwo)

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows).toHaveLength(1)
    expect(shows[0]?.id).toEqual(originalShowId)
    expect(shows[0]?.folderPath).toEqual(join(libraryTwo, 'Top Chef'))

    const seasons = await testDb.db.select().from(testDb.schema.seasons)

    expect(seasons.map((season) => season.seasonNumber).sort()).toEqual([1, 2])

    const episodes = await testDb.db.select().from(testDb.schema.episodes)

    expect(episodes).toHaveLength(2)
    expect(
      episodes.every((episode) =>
        episode.filePath.startsWith(join(libraryTwo, 'Top Chef'))
      )
    ).toEqual(true)

    const newFirstEpisode = episodes.find(
      (episode) => episode.seasonNumber === 1 && episode.episodeNumber === 1
    )

    const progress = await testDb.db
      .select()
      .from(testDb.schema.watchProgress)

    expect(progress).toEqual([
      {
        currentTime: 900,
        duration: 2600,
        episodeId: newFirstEpisode?.id ?? 0,
        id: insertedProgress[0]?.id ?? 0,
        movieId: null,
        profileId,
        updatedAt: progressTimestamp
      }
    ])
  })

  it('merges a pre-existing duplicate show row into the scanned show', async () => {
    const library = join(temporaryDirectory, 'library')

    await createEpisodeFile(
      library,
      'Top Chef',
      'Season 1',
      'Top Chef S01E01.mkv'
    )
    await createEpisodeFile(
      library,
      'Top Chef',
      'Season 2',
      'Top Chef S02E01.mkv'
    )
    await scanShowLibrary(library)

    // Recreate the historical bad state: a leftover duplicate row pointing at
    // a folder that no longer exists, with an episode and watch progress.
    const deadFolder = join(temporaryDirectory, 'gone', 'Top Chef')
    const insertedDuplicate = await testDb.db
      .insert(testDb.schema.shows)
      .values({
        createdAt: progressTimestamp,
        folderPath: deadFolder,
        title: 'Top Chef',
        updatedAt: progressTimestamp
      })
      .returning({ id: testDb.schema.shows.id })
    const duplicateShowId = insertedDuplicate[0]?.id ?? 0

    const insertedSeason = await testDb.db
      .insert(testDb.schema.seasons)
      .values({ seasonNumber: 1, showId: duplicateShowId })
      .returning({ id: testDb.schema.seasons.id })

    const insertedEpisode = await testDb.db
      .insert(testDb.schema.episodes)
      .values({
        createdAt: progressTimestamp,
        episodeNumber: 1,
        fileName: 'Top Chef S01E01.mkv',
        filePath: join(deadFolder, 'Season 1', 'Top Chef S01E01.mkv'),
        seasonId: insertedSeason[0]?.id ?? 0,
        seasonNumber: 1,
        showId: duplicateShowId,
        title: 'Episode 1',
        updatedAt: progressTimestamp
      })
      .returning({ id: testDb.schema.episodes.id })

    const profileId = await createProfile()

    await testDb.db.insert(testDb.schema.watchProgress).values({
      currentTime: 1200,
      duration: 2600,
      episodeId: insertedEpisode[0]?.id ?? 0,
      profileId,
      updatedAt: progressTimestamp
    })

    await scanShowLibrary(library)

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows).toHaveLength(1)
    expect(shows[0]?.folderPath).toEqual(join(library, 'Top Chef'))

    const episodes = await testDb.db.select().from(testDb.schema.episodes)

    expect(episodes).toHaveLength(2)

    const survivingFirstEpisode = episodes.find(
      (episode) => episode.seasonNumber === 1 && episode.episodeNumber === 1
    )

    const progress = await testDb.db
      .select({
        currentTime: testDb.schema.watchProgress.currentTime,
        episodeId: testDb.schema.watchProgress.episodeId
      })
      .from(testDb.schema.watchProgress)

    expect(progress).toEqual([
      { currentTime: 1200, episodeId: survivingFirstEpisode?.id ?? 0 }
    ])
  })

  it('matches a moved show by external id and updates its folder path', async () => {
    const externalMetadataStub = Layer.succeed(Metadata, {
      fetchMovieByExternalId: () => Effect.succeed(null),
      fetchMovieMetadata: () => Effect.succeed(null),
      fetchSeasonMetadata: () => Effect.succeed(null),
      fetchShowByExternalId: () => Effect.succeed(null),
      fetchShowMetadata: () =>
        Effect.succeed({
          backdropUrl: null,
          externalId: 'show-123',
          genres: 'Reality',
          numberOfSeasons: 2,
          overview: 'Chefs compete.',
          posterUrl: null,
          rating: null,
          title: 'Top Chef',
          year: 2006
        })
    } as unknown as Metadata)

    const externalScannerLayer = ShowScanner.DefaultWithoutDependencies.pipe(
      Layer.provide(externalMetadataStub),
      Layer.provide(databaseTestLayer(testDb.db))
    )

    const scanWithExternalMetadata = (path: string) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const showScanner = yield* ShowScanner

          return yield* showScanner.scanShowLibrary(path)
        }).pipe(Effect.provide(externalScannerLayer))
      )

    const libraryOne = join(temporaryDirectory, 'library-one')
    const libraryTwo = join(temporaryDirectory, 'library-two')

    await createEpisodeFile(
      libraryOne,
      'Top Chef',
      'Season 1',
      'Top Chef S01E01.mkv'
    )
    await scanWithExternalMetadata(libraryOne)

    await mkdir(libraryTwo, { recursive: true })
    await rename(join(libraryOne, 'Top Chef'), join(libraryTwo, 'Top Chef'))
    await scanWithExternalMetadata(libraryTwo)

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows).toHaveLength(1)
    expect(shows[0]?.externalId).toEqual('show-123')
    expect(shows[0]?.folderPath).toEqual(join(libraryTwo, 'Top Chef'))
  })

  it('does not claim a show whose original folder still exists', async () => {
    const libraryOne = join(temporaryDirectory, 'library-one')
    const libraryTwo = join(temporaryDirectory, 'library-two')

    await createEpisodeFile(
      libraryOne,
      'First Wave',
      'Season 1',
      'First Wave S01E01.mkv'
    )
    await createEpisodeFile(
      libraryTwo,
      'First Wave',
      'Season 1',
      'First Wave S01E01.mkv'
    )

    await scanShowLibrary(libraryOne)
    await scanShowLibrary(libraryTwo)

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows).toHaveLength(2)
    expect(shows.map((show) => show.folderPath).sort()).toEqual([
      join(libraryOne, 'First Wave'),
      join(libraryTwo, 'First Wave')
    ])

    const episodes = await testDb.db.select().from(testDb.schema.episodes)

    expect(episodes).toHaveLength(2)
  })

  it('removes episodes whose files were deleted and drops empty seasons', async () => {
    const library = join(temporaryDirectory, 'library')

    await createEpisodeFile(
      library,
      'First Wave',
      'Season 1',
      'First Wave S01E01.mkv'
    )
    await createEpisodeFile(
      library,
      'First Wave',
      'Season 2',
      'First Wave S02E01.mkv'
    )
    await scanShowLibrary(library)

    await rm(join(library, 'First Wave', 'Season 2'), {
      force: true,
      recursive: true
    })
    await scanShowLibrary(library)

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows).toHaveLength(1)

    const seasons = await testDb.db.select().from(testDb.schema.seasons)

    expect(seasons.map((season) => season.seasonNumber)).toEqual([1])
    expect(seasons[0]?.episodeCount).toEqual(1)

    const episodes = await testDb.db.select().from(testDb.schema.episodes)

    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.seasonNumber).toEqual(1)
  })

  it('leaves shows from other libraries untouched during reconciliation', async () => {
    const libraryOne = join(temporaryDirectory, 'library-one')
    const libraryTwo = join(temporaryDirectory, 'library-two')

    await createEpisodeFile(
      libraryOne,
      'First Wave',
      'Season 1',
      'First Wave S01E01.mkv'
    )
    await createEpisodeFile(
      libraryTwo,
      'Stargate',
      'Season 1',
      'Stargate S01E01.mkv'
    )
    await scanShowLibrary(libraryOne)

    // Even with its files gone, a show outside the scanned library and
    // sharing no identity with a scanned show must not be touched.
    await rm(join(libraryOne, 'First Wave'), { force: true, recursive: true })
    await scanShowLibrary(libraryTwo)

    const shows = await testDb.db.select().from(testDb.schema.shows)

    expect(shows.map((show) => show.title).sort()).toEqual([
      'First Wave',
      'Stargate'
    ])

    const episodes = await testDb.db.select().from(testDb.schema.episodes)

    expect(episodes).toHaveLength(2)
  })

  it('keeps the newer watch progress when both old and new episodes have progress', async () => {
    const library = join(temporaryDirectory, 'library')

    await createEpisodeFile(
      library,
      'Top Chef',
      'Season 1',
      'Top Chef S01E01.mkv'
    )
    await scanShowLibrary(library)

    const profileId = await createProfile()
    const scannedEpisodes = await testDb.db
      .select()
      .from(testDb.schema.episodes)
    const survivorEpisodeId = scannedEpisodes[0]?.id ?? 0

    await testDb.db.insert(testDb.schema.watchProgress).values({
      currentTime: 300,
      duration: 2600,
      episodeId: survivorEpisodeId,
      profileId,
      updatedAt: new Date('2026-06-01T10:00:00Z')
    })

    // Duplicate row with a dead path whose progress is more recent.
    const deadFolder = join(temporaryDirectory, 'gone', 'Top Chef')
    const insertedDuplicate = await testDb.db
      .insert(testDb.schema.shows)
      .values({
        createdAt: progressTimestamp,
        folderPath: deadFolder,
        title: 'Top Chef',
        updatedAt: progressTimestamp
      })
      .returning({ id: testDb.schema.shows.id })
    const duplicateShowId = insertedDuplicate[0]?.id ?? 0

    const insertedSeason = await testDb.db
      .insert(testDb.schema.seasons)
      .values({ seasonNumber: 1, showId: duplicateShowId })
      .returning({ id: testDb.schema.seasons.id })

    const insertedEpisode = await testDb.db
      .insert(testDb.schema.episodes)
      .values({
        createdAt: progressTimestamp,
        episodeNumber: 1,
        fileName: 'Top Chef S01E01.mkv',
        filePath: join(deadFolder, 'Season 1', 'Top Chef S01E01.mkv'),
        seasonId: insertedSeason[0]?.id ?? 0,
        seasonNumber: 1,
        showId: duplicateShowId,
        title: 'Episode 1',
        updatedAt: progressTimestamp
      })
      .returning({ id: testDb.schema.episodes.id })

    const newerTimestamp = new Date('2026-07-01T10:00:00Z')

    await testDb.db.insert(testDb.schema.watchProgress).values({
      currentTime: 1800,
      duration: 2600,
      episodeId: insertedEpisode[0]?.id ?? 0,
      profileId,
      updatedAt: newerTimestamp
    })

    await scanShowLibrary(library)

    const progress = await testDb.db
      .select({
        currentTime: testDb.schema.watchProgress.currentTime,
        episodeId: testDb.schema.watchProgress.episodeId,
        updatedAt: testDb.schema.watchProgress.updatedAt
      })
      .from(testDb.schema.watchProgress)

    expect(progress).toEqual([
      {
        currentTime: 1800,
        episodeId: survivorEpisodeId,
        updatedAt: newerTimestamp
      }
    ])
  })
})
