// @vitest-environment node
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createTestDatabase } from './test-database'

describe('createTestDatabase', () => {
  it('enables SQLite foreign key enforcement', () => {
    const { sqlite } = createTestDatabase()
    const result = sqlite.pragma('foreign_keys', { simple: true })

    expect(result).toEqual(1)
  })

  it('cascades watch_progress rows when a movie is deleted', async () => {
    const { db, schema } = createTestDatabase()

    const [profile] = await db
      .insert(schema.profiles)
      .values({ name: 'tester', emoji: '🍿', createdAt: new Date() })
      .returning()

    const [movie] = await db
      .insert(schema.movies)
      .values({
        title: 'Cascade',
        filePath: '/tmp/cascade.mp4',
        fileName: 'cascade.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    await db.insert(schema.watchProgress).values({
      profileId: profile?.id ?? 0,
      movieId: movie?.id ?? 0,
      currentTime: 10,
      updatedAt: new Date()
    })

    await db.delete(schema.movies).where(eq(schema.movies.id, movie?.id ?? 0))

    const rows = await db.select().from(schema.watchProgress)

    expect(rows).toEqual([])
  })

  it('cascades watch_progress rows when an episode is deleted', async () => {
    const { db, schema } = createTestDatabase()

    const [profile] = await db
      .insert(schema.profiles)
      .values({ name: 'tester', emoji: '📺', createdAt: new Date() })
      .returning()

    const [show] = await db
      .insert(schema.shows)
      .values({
        title: 'Cascade Show',
        folderPath: '/tmp/cascade-show',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    const [season] = await db
      .insert(schema.seasons)
      .values({ showId: show?.id ?? 0, seasonNumber: 1 })
      .returning()

    const [episode] = await db
      .insert(schema.episodes)
      .values({
        showId: show?.id ?? 0,
        seasonId: season?.id ?? 0,
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Pilot',
        filePath: '/tmp/cascade-show/S01E01.mkv',
        fileName: 'S01E01.mkv',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    await db.insert(schema.watchProgress).values({
      profileId: profile?.id ?? 0,
      episodeId: episode?.id ?? 0,
      currentTime: 120,
      updatedAt: new Date()
    })

    await db
      .delete(schema.episodes)
      .where(eq(schema.episodes.id, episode?.id ?? 0))

    const rows = await db.select().from(schema.watchProgress)

    expect(rows).toEqual([])
  })
})
