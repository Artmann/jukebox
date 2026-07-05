import {
  FileSystem,
  HttpApiBuilder,
  HttpServerRequest,
  HttpServerResponse,
  Path
} from '@effect/platform'
import { Effect } from 'effect'

import { getClientAssetsDirectory } from '../runtime-paths'

// Production frontend serving, replacing @hono/node-server's serveStatic and
// the SPA fallback: /api requests pass through to the router; anything else
// answers with the matching client asset, or index.html so client-side
// routes survive a refresh. Paths resolving outside the client directory are
// treated as not-found and get the SPA fallback instead.
export const staticFilesLive = HttpApiBuilder.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest

      if (request.url === '/api' || request.url.startsWith('/api/')) {
        return yield* httpApp
      }

      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const clientDirectory = path.resolve(getClientAssetsDirectory())
      const rawPathname = request.url.split('?')[0] ?? '/'

      let pathname: string

      try {
        pathname = decodeURIComponent(rawPathname)
      } catch {
        pathname = '/'
      }

      const resolved = path.resolve(clientDirectory, `.${pathname}`)

      const insideClientDirectory =
        resolved === clientDirectory ||
        resolved.startsWith(`${clientDirectory}${path.sep}`)

      if (insideClientDirectory) {
        const isFile = yield* fileSystem.stat(resolved).pipe(
          Effect.map((info) => info.type === 'File'),
          Effect.orElseSucceed(() => false)
        )

        if (isFile) {
          return yield* HttpServerResponse.file(resolved).pipe(Effect.orDie)
        }
      }

      return yield* HttpServerResponse.file(
        path.join(clientDirectory, 'index.html')
      ).pipe(Effect.orDie)
    }),
  { withContext: true }
)
