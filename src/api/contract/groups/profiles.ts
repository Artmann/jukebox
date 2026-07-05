import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, NotFoundWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { Profile, SuccessResponse } from '../schemas'

// Both fields optional: the routes validate presence/trimming themselves and
// answer with today's exact 400 messages ('name and emoji are required',
// 'Nothing to update').
export const ProfileInput = Schema.Struct({
  emoji: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String)
})

export type ProfileInput = typeof ProfileInput.Type

// Raw string so the handler reproduces today's exact 'Invalid profile id' 400
// (and parseInt's prefix behaviour) instead of a schema decode summary.
const profileId = HttpApiSchema.param('id', Schema.String)

export const profilesGroup = HttpApiGroup.make('profiles')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
    HttpApiEndpoint.get('listProfiles', '/profiles').addSuccess(
      Schema.Array(Profile)
    )
  )
  .add(
    HttpApiEndpoint.get('getActiveProfile', '/profiles/active')
      .addSuccess(Profile)
      .addError(NotFoundWire)
  )
  .add(
    HttpApiEndpoint.post('createProfile', '/profiles')
      .setPayload(ProfileInput)
      .addSuccess(Profile, { status: 201 })
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.patch('updateProfile')`/profiles/${profileId}`
      .setPayload(ProfileInput)
      .addSuccess(Profile)
      .addError(BadRequestWire)
      .addError(NotFoundWire)
  )
  .add(
    HttpApiEndpoint.del('deleteProfile')`/profiles/${profileId}`
      .addSuccess(SuccessResponse)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.post('activateProfile')`/profiles/${profileId}/activate`
      .addSuccess(Profile)
      .addError(BadRequestWire)
      .addError(NotFoundWire)
  )
