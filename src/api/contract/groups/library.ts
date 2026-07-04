import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, NotFoundWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { Movie, MovieWithSubtitles } from '../schemas'

export const libraryGroup = HttpApiGroup.make('library')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
    HttpApiEndpoint.get('listMovies', '/library/movies').addSuccess(
      Schema.Array(Movie)
    )
  )
  .add(
    HttpApiEndpoint.get(
      'getMovie'
    )`/library/movies/${HttpApiSchema.param('id', Schema.NumberFromString)}`
      .addSuccess(MovieWithSubtitles)
      .addError(BadRequestWire)
      .addError(NotFoundWire)
  )
