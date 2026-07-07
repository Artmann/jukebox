// @vitest-environment node

// Spike for the three load-bearing @effect/platform APIs that later phases
// depend on:
//
// 1. HttpApiBuilder.Router.use — registering a raw route beside an HttpApi
//    (Phase 6 keeps /api/scan/stream and the media streams as raw routes).
// 2. HttpApiBuilder.toWebHandler — request-in/response-out testing without a
//    socket (every handler test in Phases 3-5 uses this).
// 3. HttpApp.appendPreResponseHandler — setting a response cookie from
//    handler code (the session/profile cookie pattern in Phase 3).
//
// The spike api is throwaway; the wire-shape assertions against the durable
// error catalog are not.
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApp,
  HttpServer,
  HttpServerResponse
} from '@effect/platform'
import { Effect, Layer, Schema } from 'effect'
import { afterAll, describe, expect, it } from 'vitest'

import { NotFound, NotFoundWire } from './errors'
import { jukeboxApi } from './index'

const spikeApi = HttpApi.make('spike')
  .add(
    HttpApiGroup.make('spike')
      .add(
        HttpApiEndpoint.get('ping', '/ping').addSuccess(
          Schema.Struct({ message: Schema.String })
        )
      )
      .add(
        HttpApiEndpoint.get('missing', '/missing')
          .addSuccess(Schema.Struct({ message: Schema.String }))
          .addError(NotFoundWire)
      )
  )
  .prefix('/spike')

const spikeGroupLive = HttpApiBuilder.group(spikeApi, 'spike', (handlers) =>
  handlers
    .handle('ping', () =>
      Effect.gen(function* () {
        yield* HttpApp.appendPreResponseHandler((_request, response) =>
          Effect.succeed(
            response.pipe(
              HttpServerResponse.unsafeSetCookie('spike_session', 'token', {
                httpOnly: true,
                path: '/'
              })
            )
          )
        )

        return { message: 'pong' }
      })
    )
    .handle('missing', () =>
      Effect.fail(new NotFound({ message: 'Spike resource not found' }))
    )
)

const rawRouteLive = HttpApiBuilder.Router.use((router) =>
  router.get('/spike/raw', HttpServerResponse.json({ raw: true }))
)

const { dispose, handler } = HttpApiBuilder.toWebHandler(
  Layer.mergeAll(
    HttpApiBuilder.api(spikeApi).pipe(Layer.provide(spikeGroupLive)),
    rawRouteLive,
    HttpServer.layerContext
  )
)

afterAll(async () => {
  await dispose()
})

describe('contract spike', () => {
  it('round-trips JSON through HttpApiBuilder.toWebHandler', async () => {
    const response = await handler(new Request('http://localhost/spike/ping'))

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({ message: 'pong' })
  })

  it('sets a response cookie via HttpApp.appendPreResponseHandler', async () => {
    const response = await handler(new Request('http://localhost/spike/ping'))

    expect(response.headers.get('set-cookie') ?? '').toContain(
      'spike_session=token'
    )
  })

  it('serializes catalog errors as { error: { message } } without _tag', async () => {
    const response = await handler(
      new Request('http://localhost/spike/missing')
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: { message: 'Spike resource not found' }
    })
  })

  it('serves raw routes beside the api via HttpApiBuilder.Router.use', async () => {
    const response = await handler(new Request('http://localhost/spike/raw'))

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({ raw: true })
  })
})

describe('jukebox api contract', () => {
  it('constructs the full HttpApi with all groups', () => {
    const groupNames = Object.keys(jukeboxApi.groups).sort()

    expect(groupNames).toEqual([
      'auth',
      'episodeProgress',
      'favorites',
      'filesystem',
      'hello',
      'library',
      'profiles',
      'progress',
      'scan',
      'search',
      'settings',
      'setup',
      'shows',
      'telemetry',
      'upNext'
    ])
  })
})
