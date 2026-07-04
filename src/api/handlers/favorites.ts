import { HttpApiBuilder } from '@effect/platform'
import { and, desc, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import { BadRequest, InternalError } from '../contract/errors'
import { CurrentProfile } from '../contract/middleware'
import type { FavoriteItem } from '../contract/schemas'

import {
  errorMessage,
  internalTryPromise,
  serializeMovie,
  serializeShow,
  withInternalFallback
} from './support'

// Ports src/api/routes/favorites.ts.
export const favoritesHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'favorites',
  (handlers) =>
    handlers
      .handle('listFavorites', () =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            const [movieFavorites, showFavorites] = yield* internalTryPromise(
              () =>
                Promise.all([
                  db
                    .select({
                      createdAt: schema.favorites.createdAt,
                      movie: schema.movies
                    })
                    .from(schema.favorites)
                    .innerJoin(
                      schema.movies,
                      eq(schema.favorites.movieId, schema.movies.id)
                    )
                    .where(eq(schema.favorites.profileId, profileId))
                    .orderBy(desc(schema.favorites.createdAt)),
                  db
                    .select({
                      createdAt: schema.favorites.createdAt,
                      show: schema.shows
                    })
                    .from(schema.favorites)
                    .innerJoin(
                      schema.shows,
                      eq(schema.favorites.showId, schema.shows.id)
                    )
                    .where(eq(schema.favorites.profileId, profileId))
                    .orderBy(desc(schema.favorites.createdAt))
                ])
            )

            const movies = movieFavorites.map((row) => ({
              ...row,
              type: 'movie' as const
            }))
            const shows = showFavorites.map((row) => ({
              ...row,
              type: 'show' as const
            }))

            const combined = [...movies, ...shows].sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
            )

            return combined.map((item): FavoriteItem => {
              if (item.type === 'movie') {
                return {
                  createdAt: item.createdAt.toISOString(),
                  movie: serializeMovie(item.movie),
                  type: 'movie'
                }
              }

              return {
                createdAt: item.createdAt.toISOString(),
                show: serializeShow(item.show),
                type: 'show'
              }
            })
          })
        )
      )
      .handle('getFavoriteStatus', ({ urlParams }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            if (urlParams.movieId) {
              const movieId = parseInt(urlParams.movieId, 10)

              if (isNaN(movieId)) {
                return yield* Effect.fail(
                  new BadRequest({ message: 'Invalid movie ID' })
                )
              }

              const [favorite] = yield* internalTryPromise(() =>
                db
                  .select({ id: schema.favorites.id })
                  .from(schema.favorites)
                  .where(
                    and(
                      eq(schema.favorites.profileId, profileId),
                      eq(schema.favorites.movieId, movieId)
                    )
                  )
                  .limit(1)
              )

              return { favorite: !!favorite }
            }

            if (urlParams.showId) {
              const showId = parseInt(urlParams.showId, 10)

              if (isNaN(showId)) {
                return yield* Effect.fail(
                  new BadRequest({ message: 'Invalid show ID' })
                )
              }

              const [favorite] = yield* internalTryPromise(() =>
                db
                  .select({ id: schema.favorites.id })
                  .from(schema.favorites)
                  .where(
                    and(
                      eq(schema.favorites.profileId, profileId),
                      eq(schema.favorites.showId, showId)
                    )
                  )
                  .limit(1)
              )

              return { favorite: !!favorite }
            }

            return yield* Effect.fail(
              new BadRequest({ message: 'movieId or showId required' })
            )
          })
        )
      )
      .handle('addFavorite', ({ payload }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            if (
              (typeof payload.movieId !== 'number' &&
                typeof payload.showId !== 'number') ||
              (typeof payload.movieId === 'number' &&
                typeof payload.showId === 'number')
            ) {
              return yield* Effect.fail(
                new BadRequest({
                  message: 'Provide exactly one of movieId or showId'
                })
              )
            }

            const now = new Date()

            // A UNIQUE violation means the favorite already exists — treated
            // as success, like the Hono route. Anything else is rethrown
            // (Hono let it reach app.onError as a 500).
            yield* Effect.tryPromise({
              catch: (error) => error,
              try: () =>
                db.insert(schema.favorites).values({
                  profileId,
                  movieId: payload.movieId ?? null,
                  showId: payload.showId ?? null,
                  createdAt: now
                })
            }).pipe(
              Effect.catchAll((error) =>
                errorMessage(error).includes('UNIQUE')
                  ? Effect.void
                  : Effect.fail(
                      new InternalError({ message: errorMessage(error) })
                    )
              )
            )

            return { success: true }
          })
        )
      )
      .handle('removeFavorite', ({ payload }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            if (typeof payload.movieId === 'number') {
              const movieId = payload.movieId

              yield* internalTryPromise(() =>
                db
                  .delete(schema.favorites)
                  .where(
                    and(
                      eq(schema.favorites.profileId, profileId),
                      eq(schema.favorites.movieId, movieId)
                    )
                  )
              )

              return { success: true }
            }

            if (typeof payload.showId === 'number') {
              const showId = payload.showId

              yield* internalTryPromise(() =>
                db
                  .delete(schema.favorites)
                  .where(
                    and(
                      eq(schema.favorites.profileId, profileId),
                      eq(schema.favorites.showId, showId)
                    )
                  )
              )

              return { success: true }
            }

            return yield* Effect.fail(
              new BadRequest({ message: 'movieId or showId required' })
            )
          })
        )
      )
)
