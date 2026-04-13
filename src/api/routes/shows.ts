import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'

const showRoutes = new Hono()

// GET / - List all shows with season and episode counts
showRoutes.get('/', async (context) => {
  const shows = await db.select().from(schema.shows).orderBy(schema.shows.title)

  const showsWithCounts = await Promise.all(
    shows.map(async (show) => {
      const seasonRows = await db
        .select()
        .from(schema.seasons)
        .where(eq(schema.seasons.showId, show.id))

      const episodeRows = await db
        .select()
        .from(schema.episodes)
        .where(eq(schema.episodes.showId, show.id))

      return {
        ...show,
        seasonCount: seasonRows.length,
        episodeCount: episodeRows.length
      }
    })
  )

  return context.json(showsWithCounts)
})

// GET /episodes/:id - Get single episode with its show
// NOTE: Must come before /:id to prevent 'episodes' from being parsed as a show ID.
showRoutes.get('/episodes/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: 'Invalid episode ID' }, 400)
  }

  const [episode] = await db
    .select()
    .from(schema.episodes)
    .where(eq(schema.episodes.id, id))
    .limit(1)

  if (!episode) {
    return context.json({ error: 'Episode not found' }, 404)
  }

  const [show] = await db
    .select()
    .from(schema.shows)
    .where(eq(schema.shows.id, episode.showId))
    .limit(1)

  return context.json({ episode, show })
})

// GET /:id - Get single show with nested seasons and episodes
showRoutes.get('/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: 'Invalid show ID' }, 400)
  }

  const [show] = await db
    .select()
    .from(schema.shows)
    .where(eq(schema.shows.id, id))
    .limit(1)

  if (!show) {
    return context.json({ error: 'Show not found' }, 404)
  }

  const seasonRows = await db
    .select()
    .from(schema.seasons)
    .where(eq(schema.seasons.showId, id))
    .orderBy(schema.seasons.seasonNumber)

  const episodeRows = await db
    .select()
    .from(schema.episodes)
    .where(eq(schema.episodes.showId, id))
    .orderBy(schema.episodes.seasonNumber, schema.episodes.episodeNumber)

  const seasons = seasonRows.map((season) => ({
    ...season,
    episodes: episodeRows.filter((episode) => episode.seasonId === season.id)
  }))

  return context.json({ ...show, seasons })
})

// GET /:id/seasons/:seasonNumber - Get episodes for a specific season
showRoutes.get('/:id/seasons/:seasonNumber', async (context) => {
  const showId = parseInt(context.req.param('id'), 10)
  const seasonNumber = parseInt(context.req.param('seasonNumber'), 10)

  if (isNaN(showId) || isNaN(seasonNumber)) {
    return context.json({ error: 'Invalid parameters' }, 400)
  }

  const episodes = await db
    .select()
    .from(schema.episodes)
    .where(eq(schema.episodes.showId, showId))
    .orderBy(schema.episodes.episodeNumber)

  const filtered = episodes.filter(
    (episode) => episode.seasonNumber === seasonNumber
  )

  return context.json(filtered)
})

export { showRoutes }
