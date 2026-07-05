import { readFileSync } from 'fs'

import { HttpServer } from '@effect/platform'
import { Effect, Layer } from 'effect'

import { DatabaseLive } from './database/layer'
import { makeHttpAppLive } from './http/app'
import { HttpServerLive } from './http/server'
import { staticFilesLive } from './http/static'
import { viteDevLive } from './http/vite-proxy'
import { getPackageJsonPath, isCompiledExecutable } from './runtime-paths'
import { scanManager } from './services/scan-manager'
import { scheduler } from './services/scheduler'

// Declared like `src/database/index.ts` so the Node build (vitest, tsc) never
// depends on Bun's ambient global types.
declare const Bun: unknown

// A compiled `bun build --compile` executable has no notion of a dev mode —
// vite and its plugins are not bundled — so default NODE_ENV to production
// before any check reads it. This mirrors the `bin/jukebox-media-server.js`
// launcher used by the npm distribution.
if (isCompiledExecutable()) {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production'
}

const port = process.env.PORT ? Number(process.env.PORT) : 1990

// Dev defaults to 1991 so `bun dev` doesn't collide with an installed server:
// the JukeboxLauncher runs the compiled executable on 1990, and the compiled
// binary forces NODE_ENV=production above. Production and the packaged binary
// keep 1990; PORT overrides either.
const port = process.env.PORT
  ? Number(process.env.PORT)
  : isDevelopment
    ? 1991
    : 1990
const vitePort = 5173

// `JUKEBOX_BUILD_VERSION` is replaced at build time by
// `scripts/build-executable.ts` via `bun build --define` so compiled binaries
// don't need to read package.json off disk at runtime.
declare const JUKEBOX_BUILD_VERSION: string | undefined

function readPackageVersion(): string {
  if (
    typeof JUKEBOX_BUILD_VERSION === 'string' &&
    JUKEBOX_BUILD_VERSION.length > 0
  ) {
    return JUKEBOX_BUILD_VERSION
  }

  try {
    const content = JSON.parse(readFileSync(getPackageJsonPath(), 'utf-8')) as {
      name?: string
      version?: string
    }

    if (content.name === 'jukebox-media-server' && content.version) {
      return content.version
    }
  } catch {
    // fall through to 'unknown'
  }

  return 'unknown'
}

const version = readPackageVersion()

function printWelcome(boundPort: number) {
  const url = `http://localhost:${boundPort}`
  const bold = '\x1b[1m'
  const cyan = '\x1b[36m'
  const dim = '\x1b[2m'
  const reset = '\x1b[0m'

  const lines = [
    '',
    `  ${bold}Jukebox${reset} ${dim}v${version}${reset}`,
    '',
    `  ${cyan}➜${reset}  Open ${cyan}${url}${reset} in your browser`,
    `  ${dim}Press Ctrl+C to stop${reset}`,
    ''
  ]

  console.log(lines.join('\n'))
}

// Print the welcome banner only after the HTTP server layer is running, so the
// advertised URL is actually accepting connections.
const welcomeLayer = Layer.effectDiscard(
  Effect.flatMap(HttpServer.HttpServer, () =>
    Effect.sync(() => printWelcome(port))
  )
)

// The same boot work the Hono server did: mark scan jobs orphaned by a crash
// or restart, then start the scan scheduler. Ordered inside one acquire so
// the scheduler can't kick off a scan while recovery is still rewriting job
// rows; the release stops the scheduler's timer on shutdown. Both singletons
// become scoped Effect services in Phase 5.
const scanBootLayer = Layer.scopedDiscard(
  Effect.acquireRelease(
    Effect.promise(async () => {
      await scanManager.recoverInterruptedJobs()
      await scheduler.start()
    }),
    () => Effect.sync(() => scheduler.stop())
  )
)

// Dev mode proxies non-/api requests to a Vite server it owns; production
// serves the built client assets with an index.html SPA fallback.
const isDevelopment = process.env.NODE_ENV !== 'production'

const frontendLayer = isDevelopment ? viteDevLive : staticFilesLive

// The assembled HttpApi (all 14 groups), the raw streaming routes, and the
// frontend served on the dual-runtime server layer.
const mainLayer = Layer.mergeAll(
  makeHttpAppLive(frontendLayer),
  welcomeLayer,
  scanBootLayer
).pipe(Layer.provide(DatabaseLive), Layer.provide(HttpServerLive))

// `runMain` installs SIGINT/SIGTERM handling and interrupts the layer's
// finalizers on shutdown, so no manual `process.on` handlers are needed. The
// runtime is picked with the same literal-import pattern as the platform layer
// so `bun build --compile` can discover both modules.
if (typeof Bun !== 'undefined') {
  const { BunRuntime } = await import('@effect/platform-bun')

  BunRuntime.runMain(Layer.launch(mainLayer))
} else {
  const { NodeRuntime } = await import('@effect/platform-node')

  NodeRuntime.runMain(Layer.launch(mainLayer))
}
