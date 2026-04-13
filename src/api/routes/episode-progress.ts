import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'

const episodeProgressRoutes = new Hono()

// GET /:episodeId
episodeProgressRoutes.get('/:episodeId', async (context) => {
  const episodeId = parseInt(context.req.param('episodeId'), 10)

  if (isNaN(episodeId)) {
    return context.json({ error: 'Invalid episode ID' }, 400)
  }

  const [progress] = await db
    .select()
    .from(schema.watchProgress)
    .where(eq(schema.watchProgress.episodeId, episodeId))
    .limit(1)

  if (!progress) {
    return context.json({ currentTime: 0, duration: null })
  }

  return context.json({ currentTime: progress.currentTime, duration: progress.duration })
})

// PUT /:episodeId
episodeProgressRoutes.put('/:episodeId', async (context) => {
  const episodeId = parseInt(context.req.param('episodeId'), 10)

  if (isNaN(episodeId)) {
    return context.json({ error: 'Invalid episode ID' }, 400)
  }

  const body = await context.req.json<{ currentTime: number; duration?: number }>()

  if (typeof body.currentTime !== 'number') {
    return context.json({ error: 'currentTime is required' }, 400)
  }

  const [existing] = await db
    .select()
    .from(schema.watchProgress)
    .where(eq(schema.watchProgress.episodeId, episodeId))
    .limit(1)

  const now = new Date()

  if (existing) {
    await db
      .update(schema.watchProgress)
      .set({
        currentTime: Math.floor(body.currentTime),
        duration: body.duration ? Math.floor(body.duration) : existing.duration,
        updatedAt: now
      })
      .where(eq(schema.watchProgress.episodeId, episodeId))
  } else {
    await db.insert(schema.watchProgress).values({
      episodeId,
      currentTime: Math.floor(body.currentTime),
      duration: body.duration ? Math.floor(body.duration) : null,
      updatedAt: now
    })
  }

  return context.json({ success: true })
})

export { episodeProgressRoutes }
