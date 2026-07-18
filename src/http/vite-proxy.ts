import {
  HttpApiBuilder,
  HttpServerRequest,
  HttpServerResponse
} from '@effect/platform'
import { Effect, Layer, Stream } from 'effect'

// Dev Vite defaults to 5191 so it doesn't collide with other apps on 5173.
// VITE_PORT overrides; HMR connects to this port directly from the browser.
function getVitePort(): number {
  if (process.env.VITE_PORT) {
    return Number(process.env.VITE_PORT)
  }

  return 5191
}

const vitePort = getVitePort()

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

// Owns the Vite dev server as a scoped resource: started when the layer is
// built, closed by the finalizer on shutdown. The dynamic import keeps vite
// out of production bundles — a compiled executable never builds this layer.
const viteServerLive = Layer.scopedDiscard(
  Effect.acquireRelease(
    Effect.promise(async () => {
      const { createServer } = await import('vite')

      const server = await createServer({
        configFile: './vite.config.ts',
        server: {
          hmr: {
            clientPort: vitePort
          },
          port: vitePort,
          strictPort: true
        }
      })

      await server.listen()

      return server
    }),
    (server) => Effect.promise(() => server.close())
  )
)

// Dev-mode frontend: non-/api requests forward to the Vite dev server with
// hop-by-hop headers stripped, matching the Hono setupViteProxy. A proxy
// failure falls through to the router (and its 404) instead of erroring, so
// a Vite restart doesn't take the API down with it. HMR connects to the Vite
// port directly from the browser, not through the API proxy.
const viteProxyMiddlewareLive = HttpApiBuilder.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest

      if (request.url === '/api' || request.url.startsWith('/api/')) {
        return yield* httpApp
      }

      const headers = new Headers()

      for (const [key, value] of Object.entries(request.headers)) {
        if (!hopByHopHeaders.has(key.toLowerCase())) {
          headers.set(key, value)
        }
      }

      const includeBody = request.method !== 'GET' && request.method !== 'HEAD'
      const sourceRequest = includeBody
        ? (request.source as Request | undefined)
        : undefined

      const proxied = yield* Effect.tryPromise(() =>
        fetch(`http://localhost:${vitePort}${request.url}`, {
          body: sourceRequest?.body ?? undefined,
          headers,
          method: request.method
        })
      ).pipe(Effect.either)

      if (proxied._tag === 'Left') {
        return yield* httpApp
      }

      const response = proxied.right
      const responseHeaders: Record<string, string> = {}

      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      if (response.body === null) {
        return HttpServerResponse.empty({
          headers: responseHeaders,
          status: response.status
        })
      }

      const body = response.body

      return HttpServerResponse.stream(
        Stream.fromReadableStream(
          () => body,
          (error) => error
        ).pipe(Stream.orDie),
        {
          headers: responseHeaders,
          status: response.status
        }
      )
    }),
  { withContext: true }
)

export const viteDevLive = Layer.mergeAll(
  viteProxyMiddlewareLive,
  viteServerLive
)
