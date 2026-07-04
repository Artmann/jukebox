import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

import { AuthMiddleware, ProfileMiddleware } from '../middleware'

export const HelloResponse = Schema.Struct({
  message: Schema.String
})

export type HelloResponse = typeof HelloResponse.Type

export const HelloMethodResponse = Schema.Struct({
  message: Schema.String,
  method: Schema.String
})

export type HelloMethodResponse = typeof HelloMethodResponse.Type

// `root` is the inline `GET /api` route from src/api/index.ts — the '/' path
// here becomes '/api' once the api-level prefix is applied.
//
// Middleware is attached per-endpoint instead of per-group because Hono's
// `/api/*` matcher never matched `/api` itself: the root endpoint runs with no
// auth and no profile cookie, while the /hello endpoints get both. Adding
// ProfileMiddleware first and AuthMiddleware second makes auth run first at
// request time (the builder applies later-added middleware on the outside),
// matching today's `app.use` order.
export const helloGroup = HttpApiGroup.make('hello')
  .add(HttpApiEndpoint.get('root', '/').addSuccess(HelloResponse))
  .add(
    HttpApiEndpoint.get('getHello', '/hello')
      .addSuccess(HelloMethodResponse)
      .middleware(ProfileMiddleware)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.put('putHello', '/hello')
      .addSuccess(HelloMethodResponse)
      .middleware(ProfileMiddleware)
      .middleware(AuthMiddleware)
  )
  .add(
    HttpApiEndpoint.get(
      'greet'
    )`/hello/${HttpApiSchema.param('name', Schema.String)}`
      .addSuccess(HelloResponse)
      .middleware(ProfileMiddleware)
      .middleware(AuthMiddleware)
  )
