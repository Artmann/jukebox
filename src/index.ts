import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { serve } from '@hono/node-server'
import type { ViteDevServer } from 'vite'

import { app, setupStaticServing, setupViteProxy } from './api'

const port = process.env.PORT ? Number(process.env.PORT) : 1990
const vitePort = 5173
const isDevelopment = process.env.NODE_ENV !== 'production'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readPackageVersion(): string {
  // Try bundled location (dist/server/index.js → ../../package.json) first,
  // then dev location (src/index.ts → ../package.json).
  const candidates = [
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../package.json'),
  ]

  for (const candidate of candidates) {
    try {
      const content = JSON.parse(readFileSync(candidate, 'utf-8')) as {
        name?: string
        version?: string
      }

      if (content.name === 'jukebox-media-server' && content.version) {
        return content.version
      }
    } catch {
      // try next candidate
    }
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
      strictPort: true,
    },
  })

  await viteServer.listen()

  setupViteProxy(vitePort)
} else {
  setupStaticServing()
}

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
    '',
  ]

  console.log(lines.join('\n'))
}

function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`)

  // Force exit after 2 seconds if graceful shutdown hangs
  setTimeout(() => process.exit(1), 2000).unref()

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
