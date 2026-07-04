import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

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
export const helloGroup = HttpApiGroup.make('hello')
  .add(HttpApiEndpoint.get('root', '/').addSuccess(HelloResponse))
  .add(HttpApiEndpoint.get('getHello', '/hello').addSuccess(HelloMethodResponse))
  .add(HttpApiEndpoint.put('putHello', '/hello').addSuccess(HelloMethodResponse))
  .add(
    HttpApiEndpoint.get(
      'greet'
    )`/hello/${HttpApiSchema.param('name', Schema.String)}`.addSuccess(
      HelloResponse
    )
  )
