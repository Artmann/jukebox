import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'

import { jukeboxApi } from '../contract'

import { withHandlerSpan } from './support'

// Ports src/api/routes/hello.ts plus the inline `GET /api` route from
// src/api/index.ts.
export const helloHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'hello',
  (handlers) =>
    handlers
      .handle('root', () =>
        withHandlerSpan('root', Effect.succeed({ message: 'Jukebox API' }))
      )
      .handle('getHello', () =>
        withHandlerSpan('getHello',
          Effect.succeed({ message: 'Hello, world!', method: 'GET' })
        )
      )
      .handle('putHello', () =>
        withHandlerSpan('putHello',
          Effect.succeed({ message: 'Hello, world!', method: 'PUT' })
        )
      )
      .handle('greet', ({ path }) =>
        withHandlerSpan('greet',
          Effect.succeed({ message: `Hello, ${path.name}!` })
        )
      )
)
