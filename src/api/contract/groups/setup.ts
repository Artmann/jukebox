import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, SetupValidationErrorWire } from '../errors'
import { ProfileMiddleware } from '../middleware'
import { Library, SuccessResponse } from '../schemas'

export const SetupStatus = Schema.Struct({
  libraries: Schema.Array(Library),
  libraryCount: Schema.Number,
  needsSetup: Schema.Boolean
})

export type SetupStatus = typeof SetupStatus.Type

// Entries stay Unknown: validateLibraryInput inspects each row and reports
// per-row problems through SetupValidationError's fieldErrors.
export const SetupCompleteRequest = Schema.Struct({
  libraries: Schema.optional(Schema.Array(Schema.Unknown))
})

export type SetupCompleteRequest = typeof SetupCompleteRequest.Type

// No AuthMiddleware — Hono's auth middleware skips /api/setup paths. The
// profile middleware still runs there (it runs on all of /api/*).
export const setupGroup = HttpApiGroup.make('setup')
  .middleware(ProfileMiddleware)
  .add(HttpApiEndpoint.get('getStatus', '/setup').addSuccess(SetupStatus))
  .add(
    // SetupValidationErrorWire must be added before BadRequestWire: both are
    // status 400, and the client decodes the 400 union in declaration order.
    // Struct decoding ignores excess properties, so a body carrying
    // fieldErrors would otherwise match the plain BadRequest wire first and
    // silently drop the per-row errors.
    HttpApiEndpoint.post('completeSetup', '/setup/complete')
      .setPayload(SetupCompleteRequest)
      .addSuccess(SuccessResponse)
      .addError(SetupValidationErrorWire)
      .addError(BadRequestWire)
  )
