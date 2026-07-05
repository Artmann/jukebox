import {
  HttpApiBuilder,
  HttpApiError,
  HttpMiddleware,
  HttpServerError,
  HttpServerResponse
} from '@effect/platform'
import { Cause, Effect, Layer, Option } from 'effect'

import { jukeboxApi } from '../api/contract'
import { authHandlersLive } from '../api/handlers/auth'
import { favoritesHandlersLive } from '../api/handlers/favorites'
import { filesystemHandlersLive } from '../api/handlers/filesystem'
import { helloHandlersLive } from '../api/handlers/hello'
import { profilesHandlersLive } from '../api/handlers/profiles'
import { searchHandlersLive } from '../api/handlers/search'
import { settingsHandlersLive } from '../api/handlers/settings'
import { setupHandlersLive } from '../api/handlers/setup'
import { stubHandlersLive } from '../api/handlers/stubs'
import { AuthMiddlewareLive } from '../api/middleware/auth-effect'
import { ProfileMiddlewareLive } from '../api/middleware/profile-effect'

// A schema decode failure carries per-issue details (field path + issue
// kind). Turn each into a plain-words sentence naming the offending
// field/param — the raw TreeFormatter summary is developer jargon, and every
// user-facing 400 message must be actionable.
type DecodeIssue = HttpApiError.HttpApiDecodeError['issues'][number]

const describeIssue = (issue: DecodeIssue): string => {
  const name = issue.path.map(String).join('.')
  const subject = name.length > 0 ? `\`${name}\`` : 'The request'

  if (issue._tag === 'Missing') {
    return `${subject} is required but missing`
  }

  if (issue._tag === 'Unexpected') {
    return `${subject} is not a recognized field`
  }

  const detail = issue.message
    .replace(/^Expected\s+/, 'expected ')
    .replace(/,\s*actual\s+/, ', received ')

  return `${subject} is invalid: ${detail}`
}

const humanizeDecodeError = (error: HttpApiError.HttpApiDecodeError): string => {
  if (error.issues.length === 0) {
    return 'The request could not be understood. Check the request data and try again.'
  }

  // An optional field decodes against a union with undefined, which yields
  // one issue per union member on the same path. Keep only the first issue
  // per field — it names the type the caller actually meant to send.
  const details: string[] = []
  const seenPaths = new Set<string>()

  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')

    if (seenPaths.has(key)) {
      continue
    }

    seenPaths.add(key)
    details.push(describeIssue(issue))
  }

  return `${details.join('; ')}. Correct the request and try again.`
}

// Malformed requests must answer with today's `{ error: { message } }` 400
// wire shape instead of @effect/platform's default HttpApiDecodeError body.
// This api-level middleware sees route failures before the builder encodes
// them, so it can intercept the two malformed-input shapes:
//
// - HttpApiDecodeError (typed failure): the request reached the endpoint but a
//   path param, query param, or body field failed schema decoding. Answered
//   with a human-friendly summary of the schema issues (see describeIssue).
// - RequestError with reason 'Decode' (defect): the request body was not valid
//   JSON at all — `HttpApiBuilder` dies with the underlying RequestError
//   before schema decoding. Hono's routes answered these with 400
//   'Invalid request body.'.
//
// Everything else is refailed untouched so the catalog errors keep their
// schema-driven encoding.
export const decodeErrorRemapLive = HttpApiBuilder.middleware((httpApp) =>
  Effect.catchAllCause(httpApp, (cause) => {
    const failure = Cause.failureOption(cause)

    if (Option.isSome(failure)) {
      const error: unknown = failure.value

      if (error instanceof HttpApiError.HttpApiDecodeError) {
        return HttpServerResponse.json(
          { error: { message: humanizeDecodeError(error) } },
          { status: 400 }
        ).pipe(Effect.orDie)
      }
    }

    const defect = Cause.dieOption(cause)

    if (
      Option.isSome(defect) &&
      defect.value instanceof HttpServerError.RequestError &&
      defect.value.reason === 'Decode'
    ) {
      return HttpServerResponse.json(
        { error: { message: 'Invalid request body.' } },
        { status: 400 }
      ).pipe(Effect.orDie)
    }

    return Effect.failCause(cause)
  })
)

// Every group layer plus the middleware implementations. The only unresolved
// requirement is Database, so tests can swap in an in-memory instance while
// src/index.ts provides the real one.
export const apiLive = HttpApiBuilder.api(jukeboxApi).pipe(
  Layer.provide([
    authHandlersLive,
    favoritesHandlersLive,
    filesystemHandlersLive,
    helloHandlersLive,
    profilesHandlersLive,
    searchHandlersLive,
    settingsHandlersLive,
    setupHandlersLive,
    stubHandlersLive
  ]),
  Layer.provide([AuthMiddlewareLive, ProfileMiddlewareLive])
)

// The served app: HttpMiddleware.logger replaces hono/logger.
export const httpAppLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(decodeErrorRemapLive),
  Layer.provide(apiLive)
)
