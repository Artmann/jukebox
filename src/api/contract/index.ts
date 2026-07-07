import { HttpApi } from '@effect/platform'

import { InternalErrorWire } from './errors'
import { authGroup } from './groups/auth'
import { episodeProgressGroup } from './groups/episode-progress'
import { favoritesGroup } from './groups/favorites'
import { filesystemGroup } from './groups/filesystem'
import { helloGroup } from './groups/hello'
import { libraryGroup } from './groups/library'
import { profilesGroup } from './groups/profiles'
import { progressGroup } from './groups/progress'
import { scanGroup } from './groups/scan'
import { searchGroup } from './groups/search'
import { settingsGroup } from './groups/settings'
import { setupGroup } from './groups/setup'
import { showsGroup } from './groups/shows'
import { telemetryGroup } from './groups/telemetry'
import { upNextGroup } from './groups/up-next'

// InternalError at the api level mirrors the Hono app.onError fallback: any
// unhandled failure becomes a 500 `{ error: { message } }` on every endpoint.
export const jukeboxApi = HttpApi.make('jukebox')
  .add(authGroup)
  .add(episodeProgressGroup)
  .add(favoritesGroup)
  .add(filesystemGroup)
  .add(helloGroup)
  .add(libraryGroup)
  .add(profilesGroup)
  .add(progressGroup)
  .add(scanGroup)
  .add(searchGroup)
  .add(settingsGroup)
  .add(setupGroup)
  .add(showsGroup)
  .add(telemetryGroup)
  .add(upNextGroup)
  .addError(InternalErrorWire)
  .prefix('/api')

export * from './errors'
export * from './middleware'
export * from './schemas'
export * from './groups/auth'
export * from './groups/episode-progress'
export * from './groups/favorites'
export * from './groups/filesystem'
export * from './groups/hello'
export * from './groups/library'
export * from './groups/profiles'
export * from './groups/progress'
export * from './groups/scan'
export * from './groups/search'
export * from './groups/settings'
export * from './groups/setup'
export * from './groups/shows'
export * from './groups/telemetry'
export * from './groups/up-next'
