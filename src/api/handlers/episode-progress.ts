import { HttpApiBuilder } from '@effect/platform'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import type { EpisodeProgressEntry } from '../contract/groups/episode-progress'
import { CurrentProfile } from '../contract/middleware'

import { internalTryPromise, withInternalFallback } from './support'

// Ports src/api/routes/episode-progress.ts.
export const episodeProgressHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'episodeProgress',
  (handlers) =>
    handlers
      .handle('getShowProgress', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            const episodes = yield* internalTryPromise(() =>
              db
                .select({ id: schema.episodes.id })
                .from(schema.episodes)
                .where(eq(schema.episodes.showId, path.showId))
            )

            const episodeIds = episodes.map((episode) => episode.id)

            if (episodeIds.length === 0) {
              return {}
            }

            const progressRows = yield* internalTryPromise(() =>
              db
                .select({
                  currentTime: schema.watchProgress.currentTime,
                  duration: schema.watchProgress.duration,
                  episodeId: schema.watchProgress.episodeId,
                  updatedAt: schema.watchProgress.updatedAt
                })
                .from(schema.watchProgress)
                .where(
                  and(
                    eq(schema.watchProgress.profileId, profileId),
                    inArray(schema.watchProgress.episodeId, episodeIds),
                    gt(schema.watchProgress.currentTime, 0)
                  )
                )
            )

            const progressMap: Record<string, EpisodeProgressEntry> = {}

            for (const row of progressRows) {
              if (row.episodeId !== null) {
                progressMap[row.episodeId] = {
                  currentTime: row.currentTime,
                  duration: row.duration,
                  updatedAt: row.updatedAt.toISOString()
                }
              }
            }

            return progressMap
          })
        )
      )
      .handle('getEpisodeProgress', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            const [progress] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.watchProgress)
                .where(
                  and(
                    eq(schema.watchProgress.profileId, profileId),
                    eq(schema.watchProgress.episodeId, path.episodeId)
                  )
                )
                .limit(1)
            )

            if (!progress) {
              return { currentTime: 0, duration: null }
            }

            return {
              currentTime: progress.currentTime,
              duration: progress.duration
            }
          })
        )
      )
      .handle('saveEpisodeProgress', ({ path, payload }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            const [existing] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.watchProgress)
                .where(
                  and(
                    eq(schema.watchProgress.profileId, profileId),
                    eq(schema.watchProgress.episodeId, path.episodeId)
                  )
                )
                .limit(1)
            )

            const now = new Date()

            if (existing) {
              yield* internalTryPromise(() =>
                db
                  .update(schema.watchProgress)
                  .set({
                    currentTime: Math.floor(payload.currentTime),
                    duration: payload.duration
                      ? Math.floor(payload.duration)
                      : existing.duration,
                    updatedAt: now
                  })
                  .where(eq(schema.watchProgress.id, existing.id))
              )
            } else {
              yield* internalTryPromise(() =>
                db.insert(schema.watchProgress).values({
                  profileId,
                  episodeId: path.episodeId,
                  currentTime: Math.floor(payload.currentTime),
                  duration: payload.duration
                    ? Math.floor(payload.duration)
                    : null,
                  updatedAt: now
                })
              )
            }

            return { success: true }
          })
        )
      )
)
