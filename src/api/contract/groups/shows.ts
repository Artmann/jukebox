import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, NotFoundWire } from '../errors'
import {
  Episode,
  EpisodeWithShow,
  NextEpisodeResponse,
  ShowWithCounts,
  ShowWithSeasons
} from '../schemas'

export const NextEpisodeParams = Schema.Struct({
  afterEpisodeId: Schema.NumberFromString
})

export type NextEpisodeParams = typeof NextEpisodeParams.Type

export const showsGroup = HttpApiGroup.make('shows')
  .add(
    HttpApiEndpoint.get('listShows', '/library/shows').addSuccess(
      Schema.Array(ShowWithCounts)
    )
  )
  .add(
    HttpApiEndpoint.get(
      'getEpisode'
    )`/library/shows/episodes/${HttpApiSchema.param('id', Schema.NumberFromString)}`
      .addSuccess(EpisodeWithShow)
      .addError(BadRequestWire)
      .addError(NotFoundWire)
  )
  .add(
    HttpApiEndpoint.get(
      'getNextEpisode'
    )`/library/shows/${HttpApiSchema.param('showId', Schema.NumberFromString)}/next-episode`
      .setUrlParams(NextEpisodeParams)
      .addSuccess(NextEpisodeResponse)
      .addError(BadRequestWire)
      .addError(NotFoundWire)
  )
  .add(
    HttpApiEndpoint.get(
      'getShow'
    )`/library/shows/${HttpApiSchema.param('id', Schema.NumberFromString)}`
      .addSuccess(ShowWithSeasons)
      .addError(BadRequestWire)
      .addError(NotFoundWire)
  )
  .add(
    HttpApiEndpoint.get(
      'listSeasonEpisodes'
    )`/library/shows/${HttpApiSchema.param('id', Schema.NumberFromString)}/seasons/${HttpApiSchema.param('seasonNumber', Schema.NumberFromString)}`
      .addSuccess(Schema.Array(Episode))
      .addError(BadRequestWire)
  )
