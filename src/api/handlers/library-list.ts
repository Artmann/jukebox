import { Effect } from 'effect'

import { Database } from '../../database/layer'
import { libraries } from '../../database/schema'

import { internalTryPromise, serializeLibrary } from './support'

export const listLibrariesEffect = Effect.gen(function* () {
  const db = yield* Database

  const rows = yield* internalTryPromise(() => db.select().from(libraries))

  return rows.map(serializeLibrary)
})
