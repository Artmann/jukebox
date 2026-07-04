import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire } from '../errors'
import {
  ContinueWatchingItem,
  SuccessResponse,
  WatchProgressSummary,
  WatchProgressUpdate
} from '../schemas'

export const progressGroup = HttpApiGroup.make('progress')
  .add(
    HttpApiEndpoint.get(
      'listContinueWatching',
      '/progress/continue-watching'
    ).addSuccess(Schema.Array(ContinueWatchingItem))
  )
  .add(
    HttpApiEndpoint.get(
      'getMovieProgress'
    )`/progress/${HttpApiSchema.param('movieId', Schema.NumberFromString)}`
      .addSuccess(WatchProgressSummary)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.put(
      'saveMovieProgress'
    )`/progress/${HttpApiSchema.param('movieId', Schema.NumberFromString)}`
      .setPayload(WatchProgressUpdate)
      .addSuccess(SuccessResponse)
      .addError(BadRequestWire)
  )
