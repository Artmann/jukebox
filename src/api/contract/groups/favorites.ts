import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { FavoriteItem, SuccessResponse } from '../schemas'

export const FavoriteStatusParams = Schema.Struct({
  movieId: Schema.optional(Schema.String),
  showId: Schema.optional(Schema.String)
})

export type FavoriteStatusParams = typeof FavoriteStatusParams.Type

export const FavoriteStatusResponse = Schema.Struct({
  favorite: Schema.Boolean
})

export type FavoriteStatusResponse = typeof FavoriteStatusResponse.Type

// Exactly one of movieId/showId is required — the handler enforces it so the
// exact 400 message ('Provide exactly one of movieId or showId') survives.
export const FavoriteTargetRequest = Schema.Struct({
  movieId: Schema.optional(Schema.Number),
  showId: Schema.optional(Schema.Number)
})

export type FavoriteTargetRequest = typeof FavoriteTargetRequest.Type

// ProfileMiddleware first, AuthMiddleware second — the builder applies
// later-added middleware on the outside, so auth runs first, like Hono.
export const favoritesGroup = HttpApiGroup.make('favorites')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
    HttpApiEndpoint.get('listFavorites', '/favorites').addSuccess(
      Schema.Array(FavoriteItem)
    )
  )
  .add(
    HttpApiEndpoint.get('getFavoriteStatus', '/favorites/status')
      .setUrlParams(FavoriteStatusParams)
      .addSuccess(FavoriteStatusResponse)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.post('addFavorite', '/favorites')
      .setPayload(FavoriteTargetRequest)
      .addSuccess(SuccessResponse)
      .addError(BadRequestWire)
  )
  .add(
    HttpApiEndpoint.del('removeFavorite', '/favorites')
      .setPayload(FavoriteTargetRequest)
      .addSuccess(SuccessResponse)
      .addError(BadRequestWire)
  )
