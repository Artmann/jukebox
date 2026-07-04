import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, SetupValidationErrorWire } from '../errors'
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

export const setupGroup = HttpApiGroup.make('setup')
  .add(HttpApiEndpoint.get('getStatus', '/setup').addSuccess(SetupStatus))
  .add(
    HttpApiEndpoint.post('completeSetup', '/setup/complete')
      .setPayload(SetupCompleteRequest)
      .addSuccess(SuccessResponse)
      .addError(BadRequestWire)
      .addError(SetupValidationErrorWire)
  )
