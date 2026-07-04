import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'

import { jukeboxApi } from '../contract'

import { withInternalFallback } from './support'

// Ports src/api/routes/hello.ts plus the inline `GET /api` route from
// src/api/index.ts.
export const helloHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'hello',
  (handlers) =>
    handlers
      .handle('root', () =>
        withInternalFallback(Effect.succeed({ message: 'Jukebox API' }))
      )
      .handle('getHello', () =>
        withInternalFallback(
          Effect.succeed({ message: 'Hello, world!', method: 'GET' })
        )
      )
      .handle('putHello', () =>
        withInternalFallback(
          Effect.succeed({ message: 'Hello, world!', method: 'PUT' })
        )
      )
      .handle('greet', ({ path }) =>
        withInternalFallback(
          Effect.succeed({ message: `Hello, ${path.name}!` })
        )
      )
)
