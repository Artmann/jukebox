import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire, NotFoundWire } from '../errors'
import { Movie, MovieWithSubtitles } from '../schemas'

export const libraryGroup = HttpApiGroup.make('library')
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
