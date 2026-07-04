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

// Malformed requests must answer with today's `{ error: { message } }` 400
// wire shape instead of @effect/platform's default HttpApiDecodeError body.
// This api-level middleware sees route failures before the builder encodes
// them, so it can intercept the two malformed-input shapes:
//
// - HttpApiDecodeError (typed failure): the request reached the endpoint but a
//   path param, query param, or body field failed schema decoding. The decode
//   error's message is the TreeFormatter summary of the schema failure.
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
          { error: { message: error.message } },
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
