import { Effect } from 'effect'

import type * as schema from '../../database/schema'
import { InternalError } from '../contract/errors'
import type { Library, Movie, Profile, Show } from '../contract/schemas'

// Mirrors Hono's `app.onError` fallback message so unexpected failures keep
// producing the same `{ error: { message } }` 500 body.
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'An unexpected error occurred'

// Wrap an async call (drizzle query, plain-async service function) so a
// rejection becomes the contract's InternalError — the Effect equivalent of a
// thrown error reaching Hono's `app.onError`.
export const internalTryPromise = <A>(
  run: () => PromiseLike<A>
): Effect.Effect<A, InternalError> =>
  Effect.tryPromise({
    catch: (error) => new InternalError({ message: errorMessage(error) }),
    try: run
  })

// Same as internalTryPromise for synchronous calls (better-sqlite3 queries,
// synchronous drizzle transactions).
export const internalTry = <A>(run: () => A): Effect.Effect<A, InternalError> =>
  Effect.try({
    catch: (error) => new InternalError({ message: errorMessage(error) }),
    try: run
  })

// Parity with Hono's `app.onError`: any defect (thrown exception that no
// handler mapped) becomes a 500 `{ error: { message } }` instead of an
// unhandled cause. Wrapped around every implemented handler. The Phase-4
// stubs in stubs.ts fail with a typed InternalError directly, so they don't
// need it.
export const withInternalFallback = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | InternalError, R> =>
  Effect.catchAllDefect(effect, (defect) =>
    Effect.fail(new InternalError({ message: errorMessage(defect) }))
  )

// --- Row-to-wire serializers ------------------------------------------------
// Hono relied on JSON.stringify turning drizzle Date columns into ISO strings;
// the contract schemas expect those strings explicitly.

export const serializeLibrary = (library: schema.Library): Library => ({
  id: library.id,
  name: library.name,
  path: library.path,
  type: library.type as Library['type']
})

export const serializeMovie = (movie: schema.Movie): Movie => ({
  ...movie,
  createdAt: movie.createdAt.toISOString(),
  updatedAt: movie.updatedAt.toISOString()
})

export const serializeProfile = (profile: schema.Profile): Profile => ({
  ...profile,
  createdAt: profile.createdAt.toISOString()
})

export const serializeShow = (show: schema.Show): Show => ({
  ...show,
  createdAt: show.createdAt.toISOString(),
  updatedAt: show.updatedAt.toISOString()
})
