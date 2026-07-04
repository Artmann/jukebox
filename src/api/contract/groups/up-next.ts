import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { UpNextItem } from '../schemas'

export const upNextGroup = HttpApiGroup.make('upNext').add(
  HttpApiEndpoint.get('listUpNext', '/library/up-next').addSuccess(
    Schema.Array(UpNextItem)
  )
)
