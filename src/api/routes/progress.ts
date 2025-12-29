import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'

const progressRoutes = new Hono()

// GET /api/progress/:movieId - Get saved progress for a movie
progressRoutes.get('/:movieId', async (c) => {
  const movieId = parseInt(c.req.param('movieId'), 10)

  if (isNaN(movieId)) {
    return c.json({ error: 'Invalid movie ID' }, 400)
  }

  const [progress] = await db
    .select()
    .from(schema.watchProgress)
    .where(eq(schema.watchProgress.movieId, movieId))
    .limit(1)

  if (!progress) {
    return c.json({ currentTime: 0, duration: null })
  }

  return c.json({
    currentTime: progress.currentTime,
    duration: progress.duration
  })
})

// PUT /api/progress/:movieId - Save/update progress
progressRoutes.put('/:movieId', async (c) => {
  const movieId = parseInt(c.req.param('movieId'), 10)

  if (isNaN(movieId)) {
    return c.json({ error: 'Invalid movie ID' }, 400)
  }

  const body = await c.req.json<{ currentTime: number; duration?: number }>()

  if (typeof body.currentTime !== 'number') {
    return c.json({ error: 'currentTime is required' }, 400)
  }

  const [existing] = await db
    .select()
    .from(schema.watchProgress)
    .where(eq(schema.watchProgress.movieId, movieId))
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
      .where(eq(schema.watchProgress.movieId, movieId))
  } else {
    await db.insert(schema.watchProgress).values({
      movieId,
      currentTime: Math.floor(body.currentTime),
      duration: body.duration ? Math.floor(body.duration) : null,
      updatedAt: now
    })
  }

  return c.json({ success: true })
})

export { progressRoutes }
