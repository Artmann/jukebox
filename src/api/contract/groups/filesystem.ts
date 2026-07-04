import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, ForbiddenWire, NotFoundWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { BrowseResponse } from '../schemas'

// An empty or missing path lists filesystem roots (drives on Windows).
export const BrowseParams = Schema.Struct({
  path: Schema.optional(Schema.String)
})

export type BrowseParams = typeof BrowseParams.Type

export const filesystemGroup = HttpApiGroup.make('filesystem')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
  HttpApiEndpoint.get('browse', '/filesystem/browse')
    .setUrlParams(BrowseParams)
    .addSuccess(BrowseResponse)
    .addError(BadRequestWire)
    .addError(ForbiddenWire)
    .addError(NotFoundWire)
)
