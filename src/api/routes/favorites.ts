import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'
import type { ProfileContext } from '../middleware/profile'

const favoriteRoutes = new Hono<ProfileContext>()

favoriteRoutes.get('/', async (context) => {
  const profileId = context.get('profileId')

  const [movieFavorites, showFavorites] = await Promise.all([
    db
      .select({
        createdAt: schema.favorites.createdAt,
        movie: schema.movies
      })
      .from(schema.favorites)
      .innerJoin(schema.movies, eq(schema.favorites.movieId, schema.movies.id))
      .where(eq(schema.favorites.profileId, profileId))
      .orderBy(desc(schema.favorites.createdAt)),
    db
      .select({
        createdAt: schema.favorites.createdAt,
        show: schema.shows
      })
      .from(schema.favorites)
      .innerJoin(schema.shows, eq(schema.favorites.showId, schema.shows.id))
      .where(eq(schema.favorites.profileId, profileId))
      .orderBy(desc(schema.favorites.createdAt))
  ])

  const movies = movieFavorites.map((row) => ({
    ...row,
    type: 'movie' as const
  }))
  const shows = showFavorites.map((row) => ({
    ...row,
    type: 'show' as const
  }))

  const combined = [...movies, ...shows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )

  return context.json(combined)
})

favoriteRoutes.get('/status', async (context) => {
  const profileId = context.get('profileId')
  const movieIdParam = context.req.query('movieId')
  const showIdParam = context.req.query('showId')

  if (movieIdParam) {
    const movieId = parseInt(movieIdParam, 10)

    if (isNaN(movieId)) {
      return context.json({ error: { message: 'Invalid movie ID' } }, 400)
    }

    const [favorite] = await db
      .select({ id: schema.favorites.id })
      .from(schema.favorites)
      .where(
        and(
          eq(schema.favorites.profileId, profileId),
          eq(schema.favorites.movieId, movieId)
        )
      )
      .limit(1)

    return context.json({ favorite: !!favorite })
  }

  if (showIdParam) {
    const showId = parseInt(showIdParam, 10)

    if (isNaN(showId)) {
      return context.json({ error: { message: 'Invalid show ID' } }, 400)
    }

    const [favorite] = await db
      .select({ id: schema.favorites.id })
      .from(schema.favorites)
      .where(
        and(
          eq(schema.favorites.profileId, profileId),
          eq(schema.favorites.showId, showId)
        )
      )
      .limit(1)

    return context.json({ favorite: !!favorite })
  }

  return context.json(
    { error: { message: 'movieId or showId required' } },
    400
  )
})

favoriteRoutes.post('/', async (context) => {
  const profileId = context.get('profileId')
  const body = await context.req.json<{ movieId?: number; showId?: number }>()

  if (
    (typeof body.movieId !== 'number' && typeof body.showId !== 'number') ||
    (typeof body.movieId === 'number' && typeof body.showId === 'number')
  ) {
    return context.json(
      { error: { message: 'Provide exactly one of movieId or showId' } },
      400
    )
  }

  const now = new Date()

  try {
    await db.insert(schema.favorites).values({
      profileId,
      movieId: body.movieId ?? null,
      showId: body.showId ?? null,
      createdAt: now
    })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('UNIQUE')) {
      throw error
    }
  }

  return context.json({ success: true })
})

favoriteRoutes.delete('/', async (context) => {
  const profileId = context.get('profileId')
  const body = await context.req.json<{ movieId?: number; showId?: number }>()

  if (typeof body.movieId === 'number') {
    await db
      .delete(schema.favorites)
      .where(
        and(
          eq(schema.favorites.profileId, profileId),
          eq(schema.favorites.movieId, body.movieId)
        )
      )

    return context.json({ success: true })
  }

  if (typeof body.showId === 'number') {
    await db
      .delete(schema.favorites)
      .where(
        and(
          eq(schema.favorites.profileId, profileId),
          eq(schema.favorites.showId, body.showId)
        )
      )

    return context.json({ success: true })
  }

  return context.json(
    { error: { message: 'movieId or showId required' } },
    400
  )
})

export { favoriteRoutes }
