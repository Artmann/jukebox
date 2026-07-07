import { HttpApiBuilder } from '@effect/platform'
import { and, eq, gt, sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import { CurrentProfile } from '../contract/middleware'
import type { ContinueWatchingItem } from '../contract/schemas'

import {
  internalTryPromise,
  serializeEpisode,
  serializeMovie,
  serializeShow,
  withHandlerSpan
} from './support'
import {
  getWatchProgressEffect,
  saveWatchProgressEffect
} from './progress-support'

// Ports src/api/routes/progress.ts.
export const progressHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'progress',
  (handlers) =>
    handlers
      .handle('listContinueWatching', () =>
        withHandlerSpan('listContinueWatching',
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            const inProgressFilter = and(
              eq(schema.watchProgress.profileId, profileId),
              gt(schema.watchProgress.currentTime, 0),
              sql`(${schema.watchProgress.duration} IS NULL OR ${schema.watchProgress.currentTime} < ${schema.watchProgress.duration} * 0.9)`
            )

            const [movieResults, episodeResults] = yield* internalTryPromise(
              () =>
                Promise.all([
                  db
                    .select({
                      currentTime: schema.watchProgress.currentTime,
                      duration: schema.watchProgress.duration,
                      movie: schema.movies,
                      updatedAt: schema.watchProgress.updatedAt
                    })
                    .from(schema.watchProgress)
                    .innerJoin(
                      schema.movies,
                      eq(schema.watchProgress.movieId, schema.movies.id)
                    )
                    .where(inProgressFilter),
                  db
                    .select({
                      currentTime: schema.watchProgress.currentTime,
                      duration: schema.watchProgress.duration,
                      episode: schema.episodes,
                      show: schema.shows,
                      updatedAt: schema.watchProgress.updatedAt
                    })
                    .from(schema.watchProgress)
                    .innerJoin(
                      schema.episodes,
                      eq(schema.watchProgress.episodeId, schema.episodes.id)
                    )
                    .innerJoin(
                      schema.shows,
                      eq(schema.episodes.showId, schema.shows.id)
                    )
                    .where(inProgressFilter)
                ])
            )

            const movies = movieResults.map((result) => ({
              ...result,
              type: 'movie' as const
            }))
            const episodes = episodeResults.map((result) => ({
              ...result,
              type: 'episode' as const
            }))

            const episodesSorted = episodes.sort(
              (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
            )

            const seenShowIds = new Set<number>()
            const dedupedEpisodes = episodesSorted.filter((item) => {
              if (seenShowIds.has(item.show.id)) {
                return false
              }

              seenShowIds.add(item.show.id)

              return true
            })

            const combined = [...movies, ...dedupedEpisodes]
              .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
              .slice(0, 20)

            return combined.map((item): ContinueWatchingItem => {
              if (item.type === 'movie') {
                return {
                  currentTime: item.currentTime,
                  duration: item.duration,
                  movie: serializeMovie(item.movie),
                  type: 'movie',
                  updatedAt: item.updatedAt.toISOString()
                }
              }

              return {
                currentTime: item.currentTime,
                duration: item.duration,
                episode: serializeEpisode(item.episode),
                show: serializeShow(item.show),
                type: 'episode',
                updatedAt: item.updatedAt.toISOString()
              }
            })
          })
        )
      )
      .handle('getMovieProgress', ({ path }) =>
        withHandlerSpan('getMovieProgress',
          Effect.gen(function* () {
            const { id: profileId } = yield* CurrentProfile

            return yield* getWatchProgressEffect(profileId, {
              column: 'movieId',
              mediaId: path.movieId
            })
          })
        )
      )
      .handle('saveMovieProgress', ({ path, payload }) =>
        withHandlerSpan('saveMovieProgress',
          Effect.gen(function* () {
            const { id: profileId } = yield* CurrentProfile

            return yield* saveWatchProgressEffect(
              profileId,
              { column: 'movieId', mediaId: path.movieId },
              payload
            )
          })
        )
      )
)
