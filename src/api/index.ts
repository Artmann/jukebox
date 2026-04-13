import { Hono } from 'hono'
import { logger } from 'hono/logger'

import { episodeProgressRoutes } from './routes/episode-progress'
import { episodeStreamRoutes } from './routes/episode-stream'
import { helloRoutes } from './routes/hello'
import { libraryRoutes } from './routes/library'
import { progressRoutes } from './routes/progress'
import { showRoutes } from './routes/shows'
import { streamRoutes } from './routes/stream'

const app = new Hono()

app.use('*', logger())
app.route('/api/hello', helloRoutes)
app.route('/api/library/shows', showRoutes)
app.route('/api/library', libraryRoutes)
app.route('/api/progress/episode', episodeProgressRoutes)
app.route('/api/progress', progressRoutes)
app.route('/api/stream/episode', episodeStreamRoutes)
app.route('/api/stream', streamRoutes)
app.get('/api', (c) => c.json({ message: 'Jukebox API' }))

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
          : undefined
    })
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    })
  })
}

export { app }
