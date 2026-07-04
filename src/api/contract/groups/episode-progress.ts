import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import {
  SuccessResponse,
  WatchProgressSummary,
  WatchProgressUpdate
} from '../schemas'

export const EpisodeProgressEntry = Schema.Struct({
  currentTime: Schema.Number,
  duration: Schema.NullOr(Schema.Number),
  updatedAt: Schema.String
})

export type EpisodeProgressEntry = typeof EpisodeProgressEntry.Type

// Keyed by episode id — JSON object keys are always strings on the wire.
export const ShowProgressResponse = Schema.Record({
  key: Schema.String,
  value: EpisodeProgressEntry
})

export type ShowProgressResponse = typeof ShowProgressResponse.Type

export const episodeProgressGroup = HttpApiGroup.make('episodeProgress')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
    HttpApiEndpoint.get(
      'getShowProgress'
    )`/progress/episode/show/${HttpApiSchema.param('showId', Schema.NumberFromString)}`
      .addSuccess(ShowProgressResponse)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.get(
      'getEpisodeProgress'
    )`/progress/episode/${HttpApiSchema.param('episodeId', Schema.NumberFromString)}`
      .addSuccess(WatchProgressSummary)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.put(
      'saveEpisodeProgress'
    )`/progress/episode/${HttpApiSchema.param('episodeId', Schema.NumberFromString)}`
      .setPayload(WatchProgressUpdate)
      .addSuccess(SuccessResponse)
      .addError(BadRequestWire)
  )
