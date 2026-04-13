import { Hono } from 'hono'

import { getConfig, saveConfig } from '../../config'
import { db, schema } from '../../database'

const setupRoutes = new Hono()

setupRoutes.get('/', async (context) => {
  const config = getConfig()
  const libraries = await db.select().from(schema.libraries)

  return context.json({
    config: config ? { tmdbApiKey: config.tmdbApiKey } : null,
    hasApiKey: config?.tmdbApiKey !== undefined && config.tmdbApiKey !== '',
    libraries: libraries.map((library) => ({
      id: library.id,
      name: library.name,
      path: library.path,
      type: library.type
    })),
    libraryCount: libraries.length,
    needsSetup: libraries.length === 0
  })
})

setupRoutes.post('/complete', async (context) => {
  const body = await context.req.json<{
    libraries: Array<{ name: string; path: string; type: 'movies' | 'shows' }>
    tmdbApiKey: string
  }>()

  if (!body.tmdbApiKey) {
    return context.json({ error: { message: 'TMDB API key is required' } }, 400)
  }

  if (!body.libraries || body.libraries.length === 0) {
    return context.json(
      { error: { message: 'At least one library is required' } },
      400
    )
  }

  await saveConfig({ tmdbApiKey: body.tmdbApiKey })

  // Replace all libraries with the new set
  await db.delete(schema.libraries)

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
