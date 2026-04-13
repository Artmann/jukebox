import { Hono } from 'hono'

import { getConfig, saveConfig } from '../../config'
import { db, schema } from '../../database'

const setupRoutes = new Hono()

setupRoutes.get('/', async (context) => {
  const config = getConfig()
  const libraries = await db.select().from(schema.libraries)

  return context.json({
    hasApiKey: config?.tmdbApiKey !== undefined && config.tmdbApiKey !== '',
    libraryCount: libraries.length,
    needsSetup: libraries.length === 0
  })
})

setupRoutes.post('/complete', async (context) => {
  const body = await context.req.json() as {
    libraries: Array<{ name: string, path: string, type: 'movies' | 'shows' }>
    tmdbApiKey: string
  }

  if (!body.tmdbApiKey) {
    return context.json({ error: 'TMDB API key is required' }, 400)
  }

  if (!body.libraries || body.libraries.length === 0) {
    return context.json({ error: 'At least one library is required' }, 400)
  }

  await saveConfig({ tmdbApiKey: body.tmdbApiKey })

  const now = new Date()

  for (const library of body.libraries) {
    await db.insert(schema.libraries).values({
      name: library.name,
      path: library.path,
      type: library.type,
      createdAt: now
    })
  }

  return context.json({ success: true })
})

export { setupRoutes }
