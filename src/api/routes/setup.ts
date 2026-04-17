import { Hono } from 'hono'

import { db, schema } from '../../database'
import { getTmdbApiKey, setTmdbApiKey } from '../../services/settings'

const setupRoutes = new Hono()

setupRoutes.get('/', async (context) => {
  // Read the TMDB key from the same source-of-truth as `/api/settings`
  // so users who update it via the settings page don't see stale
  // JSON-sourced values if they bounce through /setup later.
  const apiKey = await getTmdbApiKey()
  const libraries = await db.select().from(schema.libraries)

  return context.json({
    config: apiKey !== null ? { tmdbApiKey: apiKey } : null,
    hasApiKey: apiKey !== null && apiKey !== '',
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

  await setTmdbApiKey(body.tmdbApiKey)

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
