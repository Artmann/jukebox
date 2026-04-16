import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'
import { watchedThreshold } from '../../lib/watched'
import { languageDisplayName } from '../../services/subtitles'
import type { ProfileContext } from '../middleware/profile'

const showRoutes = new Hono<ProfileContext>()

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

// GET /episodes/:id - Get single episode with its show and available subtitles
// NOTE: Must come before /:id to prevent 'episodes' from being parsed as a show ID.
showRoutes.get('/episodes/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: { message: 'Invalid episode ID' } }, 400)
  }

  const [episode] = await db
    .select()
    .from(schema.episodes)
    .where(eq(schema.episodes.id, id))
    .limit(1)

  if (!episode) {
    return context.json({ error: { message: 'Episode not found' } }, 404)
  }

  const [show] = await db
    .select()
    .from(schema.shows)
    .where(eq(schema.shows.id, episode.showId))
    .limit(1)

  const subtitleRows = await db
    .select()
    .from(schema.subtitles)
    .where(eq(schema.subtitles.episodeId, id))

  const subtitles = subtitleRows.map((row) => ({
    id: row.id,
    displayLanguage: languageDisplayName(row.language),
    format: row.format,
    isSupported: row.format !== 'ass',
    language: row.language
  }))

  return context.json({ episode, show, subtitles })
})

// GET /:showId/next-episode?afterEpisodeId=:id - Next unwatched episode for
// the active profile, in (seasonNumber, episodeNumber) order after the given
// episode. 404 when no candidate remains.
showRoutes.get('/:showId/next-episode', async (context) => {
  const profileId = context.get('profileId')
  const showId = parseInt(context.req.param('showId'), 10)
  const afterEpisodeIdParam = context.req.query('afterEpisodeId')
  const afterEpisodeId = afterEpisodeIdParam
    ? parseInt(afterEpisodeIdParam, 10)
    : NaN

  if (isNaN(showId) || isNaN(afterEpisodeId)) {
    return context.json(
      {
        error: {
          message:
            'Provide a numeric showId and a numeric afterEpisodeId query parameter.'
        }
      },
      400
    )
  }

  const [currentEpisode] = await db
    .select()
    .from(schema.episodes)
    .where(
      and(
        eq(schema.episodes.id, afterEpisodeId),
        eq(schema.episodes.showId, showId)
      )
    )
    .limit(1)

  if (!currentEpisode) {
    return context.json(
      {
        error: {
          message:
            'That episode does not belong to this show. Double-check the showId and afterEpisodeId.'
        }
      },
      404
    )
  }

  const allEpisodes = await db
    .select()
    .from(schema.episodes)
    .where(eq(schema.episodes.showId, showId))
    .orderBy(schema.episodes.seasonNumber, schema.episodes.episodeNumber)

  const laterEpisodes = allEpisodes.filter((candidate) => {
    if (candidate.seasonNumber > currentEpisode.seasonNumber) {
      return true
    }

    if (candidate.seasonNumber < currentEpisode.seasonNumber) {
      return false
    }

    return candidate.episodeNumber > currentEpisode.episodeNumber
  })

  if (laterEpisodes.length === 0) {
    return context.json(
      { error: { message: 'No more episodes after this one.' } },
      404
    )
  }

  const laterIds = laterEpisodes.map((candidate) => candidate.id)

  const progressRows = await db
    .select()
    .from(schema.watchProgress)
    .where(eq(schema.watchProgress.profileId, profileId))

  const progressByEpisodeId = new Map<
    number,
    { currentTime: number; duration: number | null }
  >()

  for (const row of progressRows) {
    if (row.episodeId !== null && laterIds.includes(row.episodeId)) {
      progressByEpisodeId.set(row.episodeId, {
        currentTime: row.currentTime,
        duration: row.duration
      })
    }
  }

  const nextEpisode = laterEpisodes.find((candidate) => {
    const progress = progressByEpisodeId.get(candidate.id)

    if (!progress) {
      return true
    }

    if (!progress.duration || progress.duration <= 0) {
      return true
    }

    return progress.currentTime / progress.duration < watchedThreshold
  })

  if (!nextEpisode) {
    return context.json(
      { error: { message: 'No more episodes after this one.' } },
      404
    )
  }

  const [show] = await db
    .select()
    .from(schema.shows)
    .where(eq(schema.shows.id, showId))
    .limit(1)

  return context.json({ episode: nextEpisode, show })
})

// GET /:id - Get single show with nested seasons and episodes
showRoutes.get('/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: { message: 'Invalid show ID' } }, 400)
  }

  const [show] = await db
    .select()
    .from(schema.shows)
    .where(eq(schema.shows.id, id))
    .limit(1)

  if (!show) {
    return context.json({ error: { message: 'Show not found' } }, 404)
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
    return context.json({ error: { message: 'Invalid parameters' } }, 400)
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
