import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'

const progressRoutes = new Hono()

// GET /api/progress/continue-watching - Get movies in progress
progressRoutes.get('/continue-watching', async (context) => {
  const results = await db
    .select({
      currentTime: schema.watchProgress.currentTime,
      duration: schema.watchProgress.duration,
      movie: schema.movies,
      updatedAt: schema.watchProgress.updatedAt,
    })
    .from(schema.watchProgress)
    .innerJoin(schema.movies, eq(schema.watchProgress.movieId, schema.movies.id))
    .where(
      and(
        gt(schema.watchProgress.currentTime, 0),
        sql`(${schema.watchProgress.duration} IS NULL OR ${schema.watchProgress.currentTime} < ${schema.watchProgress.duration} * 0.9)`
      )
    )
    .orderBy(desc(schema.watchProgress.updatedAt))
    .limit(20)

  return context.json(results)
})

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
