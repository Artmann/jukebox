import { HttpApiBuilder } from '@effect/platform'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import { NotFound } from '../contract/errors'

import {
  internalTryPromise,
  serializeMovie,
  serializeSubtitleTrack,
  withInternalFallback
} from './support'

// Ports src/api/routes/library.ts. The `id` path param is decoded by the
// contract's NumberFromString, so the handlers only deal with lookups.
export const libraryHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'library',
  (handlers) =>
    handlers
      .handle('listMovies', () =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const movies = yield* internalTryPromise(() =>
              db.select().from(schema.movies).orderBy(schema.movies.title)
            )

            return movies.map(serializeMovie)
          })
        )
      )
      .handle('getMovie', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const [movie] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.movies)
                .where(eq(schema.movies.id, path.id))
                .limit(1)
            )

            if (!movie) {
              return yield* Effect.fail(
                new NotFound({ message: 'Movie not found' })
              )
            }

            const subtitleRows = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.subtitles)
                .where(eq(schema.subtitles.movieId, path.id))
            )

            return {
              ...serializeMovie(movie),
              subtitles: subtitleRows.map(serializeSubtitleTrack)
            }
          })
        )
      )
)
