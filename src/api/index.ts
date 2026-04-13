import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

import { episodeProgressRoutes } from './routes/episode-progress'
import { episodeStreamRoutes } from './routes/episode-stream'
import { helloRoutes } from './routes/hello'
import { libraryRoutes } from './routes/library'
import { progressRoutes } from './routes/progress'
import { scanRoutes } from './routes/scan'
import { setupRoutes } from './routes/setup'
import { showRoutes } from './routes/shows'
import { streamRoutes } from './routes/stream'

const app = new Hono()

app.use('*', logger())

app.onError((error, context) => {
  console.error('Unhandled error:', error)

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'

  return context.json({ error: { message } }, 500)
})
app.route('/api/hello', helloRoutes)
app.route('/api/library/shows', showRoutes)
app.route('/api/library', libraryRoutes)
app.route('/api/progress/episode', episodeProgressRoutes)
app.route('/api/progress', progressRoutes)
app.route('/api/scan', scanRoutes)
app.route('/api/setup', setupRoutes)
app.route('/api/stream/episode', episodeStreamRoutes)
app.route('/api/stream', streamRoutes)
app.get('/api', (c) => c.json({ message: 'Jukebox API' }))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.resolve(__dirname, '../client')

export function setupStaticServing() {
  app.use(
    '*',
    serveStatic({
      root: clientDir,
      rewriteRequestPath: (requestPath) => {
        return requestPath
      },
    }),
  )

  // SPA fallback — serve index.html for unmatched non-API routes
  app.use('*', async (context, next) => {
    if (context.req.path.startsWith('/api')) {
      return next()
    }

    const html = readFileSync(path.join(clientDir, 'index.html'), 'utf-8')

    return context.html(html)
  })
}

export function setupViteProxy(vitePort: number) {
  app.all('*', async (c, next) => {
    // Skip API routes - let them be handled by Hono
    if (c.req.path.startsWith('/api')) {
      return next()
    }

    const viteUrl = `http://localhost:${vitePort}${c.req.path}`
    const response = await fetch(viteUrl, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body:
        c.req.method !== 'GET' && c.req.method !== 'HEAD'
          ? c.req.raw.body
          : undefined,
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  })
}

export { app }
