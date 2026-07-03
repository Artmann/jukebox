import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'
import { watchedThreshold } from '../../lib/watched'
import type { ProfileContext } from '../middleware/profile'

const upNextRoutes = new Hono<ProfileContext>()

interface UpNextItem {
  show: typeof schema.shows.$inferSelect
  episode: typeof schema.episodes.$inferSelect
  lastWatchedAt: string
}

// GET / - For each show the active profile has progressed on, return the next
// unwatched episode. Shows whose latest episode is still mid-watch are
// omitted so they don't duplicate the Continue Watching row.
upNextRoutes.get('/', async (context) => {
  const profileId = context.get('profileId')

  const episodeProgressRows = await db
    .select({
      currentTime: schema.watchProgress.currentTime,
      duration: schema.watchProgress.duration,
      episode: schema.episodes,
      updatedAt: schema.watchProgress.updatedAt
    })
    .from(schema.watchProgress)
    .innerJoin(
      schema.episodes,
      eq(schema.watchProgress.episodeId, schema.episodes.id)
    )
    .where(eq(schema.watchProgress.profileId, profileId))
    .orderBy(desc(schema.watchProgress.updatedAt))

  const latestRowByShow = new Map<number, (typeof episodeProgressRows)[number]>()

  for (const row of episodeProgressRows) {
    if (!latestRowByShow.has(row.episode.showId)) {
      latestRowByShow.set(row.episode.showId, row)
    }
  }

  const resolvedItems = await Promise.all(
    Array.from(latestRowByShow.entries()).map(
      async ([showId, row]): Promise<UpNextItem | null> => {
        const lastEpisode = row.episode
        const fraction =
          row.duration && row.duration > 0 ? row.currentTime / row.duration : 0
        const isComplete = fraction >= watchedThreshold

        if (!isComplete) {
          // Episode is mid-watch; ContinueWatching already surfaces it.
          return null
        }

        const showEpisodes = await db
          .select()
          .from(schema.episodes)
          .where(eq(schema.episodes.showId, showId))
          .orderBy(schema.episodes.seasonNumber, schema.episodes.episodeNumber)

        const laterEpisodes = showEpisodes.filter((candidate) => {
          if (candidate.seasonNumber > lastEpisode.seasonNumber) {
            return true
          }

          if (candidate.seasonNumber < lastEpisode.seasonNumber) {
            return false
          }

          return candidate.episodeNumber > lastEpisode.episodeNumber
        })

        if (laterEpisodes.length === 0) {
          return null
        }

        const laterIds = new Set(laterEpisodes.map((candidate) => candidate.id))

        const laterProgress = episodeProgressRows.filter(
          (progressRow) =>
            progressRow.episode.id !== lastEpisode.id &&
            laterIds.has(progressRow.episode.id)
        )

        const progressByEpisodeId = new Map<
          number,
          { currentTime: number; duration: number | null }
        >()

        for (const progressRow of laterProgress) {
          progressByEpisodeId.set(progressRow.episode.id, {
            currentTime: progressRow.currentTime,
            duration: progressRow.duration
          })
        }

        const nextEpisode = laterEpisodes.find((candidate) => {
          const progress = progressByEpisodeId.get(candidate.id)

          if (!progress) {
            return true
          }

          if (!progress.duration || progress.duration <= 0) {
            return true
          }

          return progress.currentTime / progress.duration < watchedThreshold
        })

        if (!nextEpisode) {
          return null
        }

        const [show] = await db
          .select()
          .from(schema.shows)
          .where(eq(schema.shows.id, showId))
          .limit(1)

        if (!show) {
          return null
        }

        return {
          episode: nextEpisode,
          show,
          lastWatchedAt: row.updatedAt.toISOString()
        }
      }
    )
  )

  const items = resolvedItems.filter((item): item is UpNextItem => item !== null)

  items.sort(
    (a, b) =>
      new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime()
  )

  return context.json(items.slice(0, 20))
})

export { upNextRoutes }
