import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { SearchResult } from '../schemas'

// Both params stay raw/optional strings so the handler can reproduce today's
// exact validation errors: the missing-`q` hint and the out-of-range `limit`
// message.
export const SearchParams = Schema.Struct({
  limit: Schema.optional(Schema.String),
  q: Schema.optional(Schema.String)
})

export type SearchParams = typeof SearchParams.Type

export const searchGroup = HttpApiGroup.make('search')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
  HttpApiEndpoint.get('search', '/search')
    .setUrlParams(SearchParams)
    .addSuccess(SearchResult)
    .addError(BadRequestWire)
)
