import { HttpApiBuilder } from '@effect/platform'
import { desc, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { watchedThreshold } from '../../lib/watched'
import { jukeboxApi } from '../contract'
import { CurrentProfile } from '../contract/middleware'
import type { UpNextItem } from '../contract/schemas'

import {
  internalTryPromise,
  serializeEpisode,
  serializeShow,
  withInternalFallback
} from './support'

// Ports src/api/routes/up-next.ts: for each show the active profile has
// progressed on, return the next unwatched episode. Shows whose latest
// episode is still mid-watch are omitted so they don't duplicate the
// Continue Watching row.
export const upNextHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'upNext',
  (handlers) =>
    handlers.handle('listUpNext', () =>
      withInternalFallback(
        Effect.gen(function* () {
          const db = yield* Database
          const { id: profileId } = yield* CurrentProfile

          const episodeProgressRows = yield* internalTryPromise(() =>
            db
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
          )

          const latestRowByShow = new Map<
            number,
            (typeof episodeProgressRows)[number]
          >()

          for (const row of episodeProgressRows) {
            if (!latestRowByShow.has(row.episode.showId)) {
              latestRowByShow.set(row.episode.showId, row)
            }
          }

          const resolvedItems = yield* internalTryPromise(() =>
            Promise.all(
              Array.from(latestRowByShow.entries()).map(
                async ([showId, row]): Promise<UpNextItem | null> => {
                  const lastEpisode = row.episode
                  const fraction =
                    row.duration && row.duration > 0
                      ? row.currentTime / row.duration
                      : 0
                  const isComplete = fraction >= watchedThreshold

                  if (!isComplete) {
                    // Episode is mid-watch; ContinueWatching already
                    // surfaces it.
                    return null
                  }

                  const showEpisodes = await db
                    .select()
                    .from(schema.episodes)
                    .where(eq(schema.episodes.showId, showId))
                    .orderBy(
                      schema.episodes.seasonNumber,
                      schema.episodes.episodeNumber
                    )

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

                  const laterIds = new Set(
                    laterEpisodes.map((candidate) => candidate.id)
                  )

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

                    return (
                      progress.currentTime / progress.duration <
                      watchedThreshold
                    )
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
                    episode: serializeEpisode(nextEpisode),
                    lastWatchedAt: row.updatedAt.toISOString(),
                    show: serializeShow(show)
                  }
                }
              )
            )
          )

          const items = resolvedItems.filter(
            (item): item is UpNextItem => item !== null
          )

          items.sort(
            (a, b) =>
              new Date(b.lastWatchedAt).getTime() -
              new Date(a.lastWatchedAt).getTime()
          )

          return items.slice(0, 20)
        })
      )
    )
)
