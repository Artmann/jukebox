import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

import { authMiddleware } from './middleware/auth'
import { profileMiddleware } from './middleware/profile'
import { authRoutes } from './routes/auth'
import { episodeProgressRoutes } from './routes/episode-progress'
import { episodeStreamRoutes } from './routes/episode-stream'
import { helloRoutes } from './routes/hello'
import { libraryRoutes } from './routes/library'
import { progressRoutes } from './routes/progress'
import { scanRoutes } from './routes/scan'
import { settingsRoutes } from './routes/settings'
import { setupRoutes } from './routes/setup'
import { profileRoutes } from './routes/profiles'
import { favoriteRoutes } from './routes/favorites'
import { showRoutes } from './routes/shows'
import { streamRoutes } from './routes/stream'
import { subtitleRoutes } from './routes/subtitles'
import { transcodeRoutes } from './routes/transcode'
import { upNextRoutes } from './routes/up-next'

const app = new Hono()

app.use('*', logger())

app.use('/api/*', authMiddleware)
app.use('/api/*', profileMiddleware)

app.onError((error, context) => {
  console.error('Unhandled error:', error)

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'

  return context.json({ error: { message } }, 500)
})
app.route('/api/auth', authRoutes)
app.route('/api/hello', helloRoutes)
app.route('/api/library/shows', showRoutes)
app.route('/api/library/up-next', upNextRoutes)
app.route('/api/library', libraryRoutes)
app.route('/api/progress/episode', episodeProgressRoutes)
app.route('/api/progress', progressRoutes)
app.route('/api/scan', scanRoutes)
app.route('/api/profiles', profileRoutes)
app.route('/api/favorites', favoriteRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/setup', setupRoutes)
app.route('/api/stream/episode', episodeStreamRoutes)
app.route('/api/stream', streamRoutes)
app.route('/api/subtitles', subtitleRoutes)
app.route('/api/transcode', transcodeRoutes)
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

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

export function setupViteProxy(vitePort: number) {
  app.all('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) {
      return next()
    }

    const viteUrl = `http://localhost:${vitePort}${c.req.path}`

    const headers = new Headers()

    c.req.raw.headers.forEach((value, key) => {
      if (!hopByHopHeaders.has(key.toLowerCase())) {
        headers.set(key, value)
      }
    })

    try {
      const response = await fetch(viteUrl, {
        method: c.req.method,
        headers,
        body:
          c.req.method !== 'GET' && c.req.method !== 'HEAD'
            ? c.req.raw.body
            : undefined,
      })

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      })
    } catch {
      return next()
    }
  })
}

export { app }
