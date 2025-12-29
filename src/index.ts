import { createServer } from 'vite'
import { app, setupViteProxy } from './api'

const port = process.env.PORT ? Number(process.env.PORT) : 3000
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

const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}, shutting down gracefully...`)

  if (viteServer) {
    await viteServer.close()
  }

  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export default {
  fetch: app.fetch,
  port
}
