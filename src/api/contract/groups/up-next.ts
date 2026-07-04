import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { UpNextItem } from '../schemas'

export const upNextGroup = HttpApiGroup.make('upNext')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
  HttpApiEndpoint.get('listUpNext', '/library/up-next').addSuccess(
    Schema.Array(UpNextItem)
  )
)
