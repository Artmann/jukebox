import { createServer } from 'vite'
import { app, setupViteProxy } from './api'

const port = process.env.PORT ? Number(process.env.PORT) : 1990
const vitePort = 5173
const isDevelopment = process.env.NODE_ENV !== 'production'

let viteServer: Awaited<ReturnType<typeof createServer>> | null = null

if (isDevelopment) {
  viteServer = await createServer({
    configFile: './vite.config.ts',
    server: {
      port: vitePort,
      strictPort: true
    }
  })

  await viteServer.listen()
  console.log(`Vite dev server running at http://localhost:${vitePort}`)

  setupViteProxy(vitePort)
}

function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`)

  // Force exit after 2 seconds if graceful shutdown hangs
  setTimeout(() => process.exit(1), 2000).unref()

  if (viteServer) {
    void viteServer.close().finally(() => process.exit(0))
  } else {
    process.exit(0)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export default {
  fetch: app.fetch,
  port
}
