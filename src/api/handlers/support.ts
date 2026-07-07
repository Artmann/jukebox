import { Effect } from 'effect'

import type * as schema from '../../database/schema'
import { parseLibraryResults } from '../../services/scan-manager'
import { languageDisplayName } from '../../services/subtitles'
import { InternalError } from '../contract/errors'
import type {
  Episode,
  Library,
  Movie,
  Profile,
  ScanJobSummary,
  Show,
  SubtitleTrack
} from '../contract/schemas'

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
// unhandled cause. Wrapped around every handler.
const withInternalFallback = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | InternalError, R> =>
  Effect.catchAllDefect(effect, (defect) =>
    Effect.fail(new InternalError({ message: errorMessage(defect) }))
  )

// The same internal-defect fallback, plus a tracing span named after the
// handler so each request records a `handler <name>` span under its root
// request span. A handler that fails flips the span to error status
// automatically (the tracer reads the Exit). Used in place of
// `withInternalFallback` by every traced handler; the telemetry ingest handler
// deliberately keeps plain `withInternalFallback` so recording frontend spans
// never produces backend spans of its own.
export const withHandlerSpan = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | InternalError, R> =>
  withInternalFallback(effect).pipe(
    Effect.withSpan(`handler ${name}`, { kind: 'internal' })
  )

// --- Row-to-wire serializers ------------------------------------------------
// Hono relied on JSON.stringify turning drizzle Date columns into ISO strings;
// the contract schemas expect those strings explicitly.

export const serializeEpisode = (episode: schema.Episode): Episode => ({
  ...episode,
  createdAt: episode.createdAt.toISOString(),
  updatedAt: episode.updatedAt.toISOString()
})

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

export const serializeScanJob = (job: schema.ScanJob): ScanJobSummary => ({
  added: job.added,
  endedAt: job.endedAt?.toISOString() ?? null,
  errorMessage: job.errorMessage,
  id: job.id,
  libraries: parseLibraryResults(job.libraryResults),
  startedAt: job.startedAt.toISOString(),
  status: job.status as ScanJobSummary['status'],
  total: job.total,
  updated: job.updated
})

export const serializeShow = (show: schema.Show): Show => ({
  ...show,
  createdAt: show.createdAt.toISOString(),
  updatedAt: show.updatedAt.toISOString()
})

export const serializeSubtitleTrack = (
  subtitle: schema.Subtitle
): SubtitleTrack => ({
  displayLanguage: languageDisplayName(subtitle.language),
  format: subtitle.format as SubtitleTrack['format'],
  id: subtitle.id,
  isSupported: subtitle.format !== 'ass',
  language: subtitle.language
})
