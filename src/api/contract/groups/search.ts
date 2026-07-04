import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire } from '../errors'
import { SearchResult } from '../schemas'

// `limit` stays a raw string so the handler can reproduce today's exact
// validation error for non-integer or out-of-range values.
export const SearchParams = Schema.Struct({
  limit: Schema.optional(Schema.String),
  q: Schema.String
})

export type SearchParams = typeof SearchParams.Type

export const searchGroup = HttpApiGroup.make('search').add(
  HttpApiEndpoint.get('search', '/search')
    .setUrlParams(SearchParams)
    .addSuccess(SearchResult)
    .addError(BadRequestWire)
)
