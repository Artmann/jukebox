import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, LibraryInUseWire, NotFoundWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { Library, SuccessResponse } from '../schemas'

export const DeleteLibraryParams = Schema.Struct({
  force: Schema.optional(Schema.String)
})

export type DeleteLibraryParams = typeof DeleteLibraryParams.Type

// Loose on purpose: validateLibraryInput answers with today's exact 400
// messages ('Library path is required.', 'Library type must be "movies" or
// "shows".').
export const LibraryCreateRequest = Schema.Struct({
  name: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String)
})

export type LibraryCreateRequest = typeof LibraryCreateRequest.Type

export const ScanScheduleValue = Schema.Literal('off', '6h', '12h', '24h')

export type ScanScheduleValue = typeof ScanScheduleValue.Type

export const ScanScheduleResponse = Schema.Struct({
  nextRunAt: Schema.NullOr(Schema.String),
  schedule: ScanScheduleValue
})

export type ScanScheduleResponse = typeof ScanScheduleResponse.Type

// Loose so the handler can answer invalid values with today's exact 400
// message ('Scan schedule must be one of: off, 6h, 12h, 24h.').
export const ScanScheduleUpdateRequest = Schema.Struct({
  schedule: Schema.optional(Schema.String)
})

export type ScanScheduleUpdateRequest = typeof ScanScheduleUpdateRequest.Type

export const SettingValueResponse = Schema.Struct({
  value: Schema.NullOr(Schema.String)
})

export type SettingValueResponse = typeof SettingValueResponse.Type

// `value` is Unknown so non-string values reach the handler and get today's
// exact 400 message ('Setting value must be a string.').
export const SettingUpdateRequest = Schema.Struct({
  value: Schema.optional(Schema.Unknown)
})

export type SettingUpdateRequest = typeof SettingUpdateRequest.Type

export const SettingUpdateResponse = Schema.Struct({
  value: Schema.String
})

export type SettingUpdateResponse = typeof SettingUpdateResponse.Type

const settingKey = HttpApiSchema.param('key', Schema.String)

export const settingsGroup = HttpApiGroup.make('settings')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
    HttpApiEndpoint.get('listLibraries', '/settings/libraries').addSuccess(
      Schema.Array(Library)
    )
  )
  .add(
    HttpApiEndpoint.post('createLibrary', '/settings/libraries')
      .setPayload(LibraryCreateRequest)
      .addSuccess(Library, { status: 201 })
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.del(
      'deleteLibrary'
    )`/settings/libraries/${HttpApiSchema.param('id', Schema.NumberFromString)}`
      .setUrlParams(DeleteLibraryParams)
      .addSuccess(SuccessResponse)
      .addError(BadRequestWire)
      .addError(NotFoundWire)
      .addError(LibraryInUseWire)
  )
  .add(
    HttpApiEndpoint.get('getScanSchedule', '/settings/scan-schedule').addSuccess(
      ScanScheduleResponse
    )
  )
  .add(
    HttpApiEndpoint.put('updateScanSchedule', '/settings/scan-schedule')
      .setPayload(ScanScheduleUpdateRequest)
      .addSuccess(ScanScheduleResponse)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.get('getSetting')`/settings/${settingKey}`
      .addSuccess(SettingValueResponse)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.put('updateSetting')`/settings/${settingKey}`
      .setPayload(SettingUpdateRequest)
      .addSuccess(SettingUpdateResponse)
      .addError(BadRequestWire)
  )
