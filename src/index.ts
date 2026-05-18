import { readFileSync } from 'fs'

import { serve } from '@hono/node-server'
import type { ViteDevServer } from 'vite'

import { app, setupStaticServing, setupViteProxy } from './api'
import { getPackageJsonPath, isCompiledExecutable } from './runtime-paths'
import { scanManager } from './services/scan-manager'
import { scheduler } from './services/scheduler'

// A compiled `bun build --compile` executable has no notion of a dev mode —
// vite and its plugins are not bundled — so default NODE_ENV to production
// before any check reads it. This mirrors the `bin/jukebox-media-server.js`
// launcher used by the npm distribution.
if (isCompiledExecutable()) {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production'
}

const port = process.env.PORT ? Number(process.env.PORT) : 1990
const vitePort = 5173
const isDevelopment = process.env.NODE_ENV !== 'production'

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

let viteServer: ViteDevServer | null = null

if (isDevelopment) {
  const { createServer } = await import('vite')

  viteServer = await createServer({
    configFile: './vite.config.ts',
    server: {
      port: vitePort,
      strictPort: true
    }
  })

  await viteServer.listen()

  setupViteProxy(vitePort)
} else {
  setupStaticServing()
}

// The scan manager recovers any scan_jobs rows left in `running` state from a
// previous crash by marking them as `error`. The scheduler then reads the
// persisted schedule and arms the first tick.
await scanManager.recoverInterruptedJobs()
await scheduler.start()

const server = serve({ fetch: app.fetch, port }, (info) => {
  printWelcome(info.port)
})

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

function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`)

  // Force exit after 2 seconds if graceful shutdown hangs
  setTimeout(() => process.exit(1), 2000).unref()

  scheduler.stop()

  server.close(() => {
    if (viteServer) {
      void viteServer.close().finally(() => process.exit(0))
    } else {
      process.exit(0)
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
