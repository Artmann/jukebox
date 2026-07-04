import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import {
  BadRequestWire,
  TooManyRequestsWire,
  UnauthorizedWire
} from '../errors'
import { ProfileMiddleware } from '../middleware'

export const AuthStatus = Schema.Struct({
  authenticated: Schema.Boolean,
  enabled: Schema.Boolean
})

export type AuthStatus = typeof AuthStatus.Type

// Optional so a missing password reaches the handler and yields today's
// 401 'Incorrect password.' instead of a schema decode failure.
export const LoginRequest = Schema.Struct({
  password: Schema.optional(Schema.String)
})

export type LoginRequest = typeof LoginRequest.Type

export const PasswordChangeRequest = Schema.Struct({
  currentPassword: Schema.optional(Schema.String),
  newPassword: Schema.optional(Schema.String)
})

export type PasswordChangeRequest = typeof PasswordChangeRequest.Type

export const PasswordChangeResponse = Schema.Struct({
  enabled: Schema.Boolean
})

export type PasswordChangeResponse = typeof PasswordChangeResponse.Type

// No AuthMiddleware — Hono's auth middleware skips /api/auth paths. The
// profile middleware still runs there (it runs on all of /api/*).
export const authGroup = HttpApiGroup.make('auth')
  .middleware(ProfileMiddleware)
  .add(HttpApiEndpoint.get('getStatus', '/auth/status').addSuccess(AuthStatus))
  .add(
    HttpApiEndpoint.post('login', '/auth/login')
      .setPayload(LoginRequest)
      .addSuccess(HttpApiSchema.NoContent)
      .addError(BadRequestWire)
      .addError(UnauthorizedWire)
      .addError(TooManyRequestsWire)
  )
  .add(
    HttpApiEndpoint.post('logout', '/auth/logout').addSuccess(
      HttpApiSchema.NoContent
    )
  )
  .add(
    HttpApiEndpoint.post('changePassword', '/auth/password')
      .setPayload(PasswordChangeRequest)
      .addSuccess(PasswordChangeResponse)
      .addError(BadRequestWire)
      .addError(UnauthorizedWire)
  )
