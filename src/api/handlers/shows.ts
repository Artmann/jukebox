import { HttpApiBuilder } from '@effect/platform'
import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import { NotFound } from '../contract/errors'

import {
  internalTryPromise,
  serializeEpisode,
  serializeShow,
  serializeSubtitleTrack,
  withInternalFallback
} from './support'

// Ports src/api/routes/shows.ts. Hono needed /episodes/:id registered before
// /:id to keep 'episodes' from parsing as a show id — the HttpApi router
// matches full path templates, so ordering no longer matters.
export const showsHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'shows',
  (handlers) =>
    handlers
      .handle('listShows', () =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const shows = yield* internalTryPromise(() =>
              db.select().from(schema.shows).orderBy(schema.shows.title)
            )

            return yield* internalTryPromise(() =>
              Promise.all(
                shows.map(async (show) => {
                  const [seasonRows, episodeRows] = await Promise.all([
                    db
                      .select()
                      .from(schema.seasons)
                      .where(eq(schema.seasons.showId, show.id)),
                    db
                      .select()
                      .from(schema.episodes)
                      .where(eq(schema.episodes.showId, show.id))
                  ])

                  return {
                    ...serializeShow(show),
                    episodeCount: episodeRows.length,
                    seasonCount: seasonRows.length
                  }
                })
              )
            )
          })
        )
      )
      .handle('getEpisode', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const [episode] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.episodes)
                .where(eq(schema.episodes.id, path.id))
                .limit(1)
            )

            if (!episode) {
              return yield* Effect.fail(
                new NotFound({ message: 'Episode not found' })
              )
            }

            const [[show], subtitleRows] = yield* internalTryPromise(() =>
              Promise.all([
                db
                  .select()
                  .from(schema.shows)
                  .where(eq(schema.shows.id, episode.showId))
                  .limit(1),
                db
                  .select()
                  .from(schema.subtitles)
                  .where(eq(schema.subtitles.episodeId, path.id))
              ])
            )

            if (!show) {
              return yield* Effect.fail(
                new NotFound({ message: 'Show not found' })
              )
            }

            return {
              episode: serializeEpisode(episode),
              show: serializeShow(show),
              subtitles: subtitleRows.map(serializeSubtitleTrack)
            }
          })
        )
      )
      .handle('getNextEpisode', ({ path, urlParams }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const [currentEpisode] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.episodes)
                .where(
                  and(
                    eq(schema.episodes.id, urlParams.afterEpisodeId),
                    eq(schema.episodes.showId, path.showId)
                  )
                )
                .limit(1)
            )

            if (!currentEpisode) {
              return yield* Effect.fail(
                new NotFound({
                  message:
                    'That episode does not belong to this show. Double-check the showId and afterEpisodeId.'
                })
              )
            }

            const allEpisodes = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.episodes)
                .where(eq(schema.episodes.showId, path.showId))
                .orderBy(
                  schema.episodes.seasonNumber,
                  schema.episodes.episodeNumber
                )
            )

            const nextEpisode = allEpisodes.find((candidate) => {
              if (candidate.seasonNumber > currentEpisode.seasonNumber) {
                return true
              }

              if (candidate.seasonNumber < currentEpisode.seasonNumber) {
                return false
              }

              return candidate.episodeNumber > currentEpisode.episodeNumber
            })

            if (!nextEpisode) {
              return yield* Effect.fail(
                new NotFound({ message: 'No more episodes after this one.' })
              )
            }

            const [show] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.shows)
                .where(eq(schema.shows.id, path.showId))
                .limit(1)
            )

            if (!show) {
              return yield* Effect.fail(
                new NotFound({ message: 'Show not found' })
              )
            }

            return {
              episode: serializeEpisode(nextEpisode),
              show: serializeShow(show)
            }
          })
        )
      )
      .handle('getShow', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const [show] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.shows)
                .where(eq(schema.shows.id, path.id))
                .limit(1)
            )

            if (!show) {
              return yield* Effect.fail(
                new NotFound({ message: 'Show not found' })
              )
            }

            const [seasonRows, episodeRows] = yield* internalTryPromise(() =>
              Promise.all([
                db
                  .select()
                  .from(schema.seasons)
                  .where(eq(schema.seasons.showId, path.id))
                  .orderBy(schema.seasons.seasonNumber),
                db
                  .select()
                  .from(schema.episodes)
                  .where(eq(schema.episodes.showId, path.id))
                  .orderBy(
                    schema.episodes.seasonNumber,
                    schema.episodes.episodeNumber
                  )
              ])
            )

            const seasons = seasonRows.map((season) => ({
              ...season,
              episodes: episodeRows
                .filter((episode) => episode.seasonId === season.id)
                .map(serializeEpisode)
            }))

            return { ...serializeShow(show), seasons }
          })
        )
      )
      .handle('listSeasonEpisodes', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const episodes = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.episodes)
                .where(eq(schema.episodes.showId, path.id))
                .orderBy(schema.episodes.episodeNumber)
            )

            return episodes
              .filter((episode) => episode.seasonNumber === path.seasonNumber)
              .map(serializeEpisode)
          })
        )
      )
)
