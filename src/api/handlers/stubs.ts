// Phase 4 replaces these stubs.
//
// `HttpApiBuilder.api(jukeboxApi)` refuses to build unless every group has an
// implementation, so the six groups that Phase 4 ports get placeholder
// handlers that fail with the api-level InternalError.
import { HttpApiBuilder } from '@effect/platform'
import { Effect, Layer } from 'effect'

import { jukeboxApi } from '../contract'
import { InternalError } from '../contract/errors'

const notImplemented = Effect.fail(
  new InternalError({ message: 'Not implemented yet.' })
)

const episodeProgressStubLive = HttpApiBuilder.group(
  jukeboxApi,
  'episodeProgress',
  (handlers) =>
    handlers
      .handle('getShowProgress', () => notImplemented)
      .handle('getEpisodeProgress', () => notImplemented)
      .handle('saveEpisodeProgress', () => notImplemented)
)

const libraryStubLive = HttpApiBuilder.group(
  jukeboxApi,
  'library',
  (handlers) =>
    handlers
      .handle('listMovies', () => notImplemented)
      .handle('getMovie', () => notImplemented)
)

const progressStubLive = HttpApiBuilder.group(
  jukeboxApi,
  'progress',
  (handlers) =>
    handlers
      .handle('listContinueWatching', () => notImplemented)
      .handle('getMovieProgress', () => notImplemented)
      .handle('saveMovieProgress', () => notImplemented)
)

const scanStubLive = HttpApiBuilder.group(jukeboxApi, 'scan', (handlers) =>
  handlers
    .handle('listLibraries', () => notImplemented)
    .handle('getStatus', () => notImplemented)
    .handle('startScan', () => notImplemented)
)

const showsStubLive = HttpApiBuilder.group(jukeboxApi, 'shows', (handlers) =>
  handlers
    .handle('listShows', () => notImplemented)
    .handle('getEpisode', () => notImplemented)
    .handle('getNextEpisode', () => notImplemented)
    .handle('getShow', () => notImplemented)
    .handle('listSeasonEpisodes', () => notImplemented)
)

const upNextStubLive = HttpApiBuilder.group(jukeboxApi, 'upNext', (handlers) =>
  handlers.handle('listUpNext', () => notImplemented)
)

export const stubHandlersLive = Layer.mergeAll(
  episodeProgressStubLive,
  libraryStubLive,
  progressStubLive,
  scanStubLive,
  showsStubLive,
  upNextStubLive
)
