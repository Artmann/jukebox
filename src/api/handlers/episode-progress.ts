import { HttpApiBuilder } from '@effect/platform'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import type { EpisodeProgressEntry } from '../contract/groups/episode-progress'
import { CurrentProfile } from '../contract/middleware'

import { internalTryPromise, withHandlerSpan } from './support'
import {
  getWatchProgressEffect,
  saveWatchProgressEffect
} from './progress-support'

// Ports src/api/routes/episode-progress.ts.
export const episodeProgressHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'episodeProgress',
  (handlers) =>
    handlers
      .handle('getShowProgress', ({ path }) =>
        withHandlerSpan('getShowProgress',
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
        withHandlerSpan('getEpisodeProgress',
          Effect.gen(function* () {
            const { id: profileId } = yield* CurrentProfile

            return yield* getWatchProgressEffect(profileId, {
              column: 'episodeId',
              mediaId: path.episodeId
            })
          })
        )
      )
      .handle('saveEpisodeProgress', ({ path, payload }) =>
        withHandlerSpan('saveEpisodeProgress',
          Effect.gen(function* () {
            const { id: profileId } = yield* CurrentProfile

            return yield* saveWatchProgressEffect(
              profileId,
              { column: 'episodeId', mediaId: path.episodeId },
              payload
            )
          })
        )
      )
)
