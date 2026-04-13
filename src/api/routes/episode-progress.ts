import { eq, gt, and, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'

const episodeProgressRoutes = new Hono()

// GET /show/:showId - Get progress for all episodes of a show
episodeProgressRoutes.get('/show/:showId', async (context) => {
  const showId = parseInt(context.req.param('showId'), 10)

  if (isNaN(showId)) {
    return context.json({ error: { message: 'Invalid show ID' } }, 400)
  }

  const episodes = await db
    .select({ id: schema.episodes.id })
    .from(schema.episodes)
    .where(eq(schema.episodes.showId, showId))

  const episodeIds = episodes.map((episode) => episode.id)

  if (episodeIds.length === 0) {
    return context.json({})
  }

  const progressRows = await db
    .select({
      episodeId: schema.watchProgress.episodeId,
      currentTime: schema.watchProgress.currentTime,
      duration: schema.watchProgress.duration,
      updatedAt: schema.watchProgress.updatedAt
    })
    .from(schema.watchProgress)
    .where(
      and(
        inArray(schema.watchProgress.episodeId, episodeIds),
        gt(schema.watchProgress.currentTime, 0)
      )
    )

  const progressMap: Record<
    number,
    { currentTime: number; duration: number | null; updatedAt: Date }
  > = {}

  for (const row of progressRows) {
    if (row.episodeId !== null) {
      progressMap[row.episodeId] = {
        currentTime: row.currentTime,
        duration: row.duration,
        updatedAt: row.updatedAt
      }
    }
  }

  return context.json(progressMap)
})

// GET /:episodeId
episodeProgressRoutes.get('/:episodeId', async (context) => {
  const episodeId = parseInt(context.req.param('episodeId'), 10)

  if (isNaN(episodeId)) {
    return context.json({ error: { message: 'Invalid episode ID' } }, 400)
  }

  const [progress] = await db
    .select()
    .from(schema.watchProgress)
    .where(eq(schema.watchProgress.episodeId, episodeId))
    .limit(1)

  if (!progress) {
    return context.json({ currentTime: 0, duration: null })
  }

  return context.json({
    currentTime: progress.currentTime,
    duration: progress.duration
  })
})

// PUT /:episodeId
episodeProgressRoutes.put('/:episodeId', async (context) => {
  const episodeId = parseInt(context.req.param('episodeId'), 10)

  if (isNaN(episodeId)) {
    return context.json({ error: { message: 'Invalid episode ID' } }, 400)
  }

  const body = await context.req.json<{
    currentTime: number
    duration?: number
  }>()

  if (typeof body.currentTime !== 'number') {
    return context.json({ error: { message: 'currentTime is required' } }, 400)
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
