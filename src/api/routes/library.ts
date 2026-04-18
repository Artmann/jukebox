import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'
import { languageDisplayName } from '../../services/subtitles'

const libraryRoutes = new Hono()

// GET /api/library/movies - List all movies
libraryRoutes.get('/movies', async (c) => {
  const movies = await db
    .select()
    .from(schema.movies)
    .orderBy(schema.movies.title)
  return c.json(movies)
})

// GET /api/library/movies/:id - Get single movie with available subtitles
libraryRoutes.get('/movies/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)

  if (isNaN(id)) {
    return c.json({ error: { message: 'Invalid movie ID' } }, 400)
  }

  const [movie] = await db
    .select()
    .from(schema.movies)
    .where(eq(schema.movies.id, id))
    .limit(1)

  if (!movie) {
    return c.json({ error: { message: 'Movie not found' } }, 404)
  }

  const subtitleRows = await db
    .select()
    .from(schema.subtitles)
    .where(eq(schema.subtitles.movieId, id))

  const subtitles = subtitleRows.map((row) => ({
    id: row.id,
    displayLanguage: languageDisplayName(row.language),
    format: row.format,
    isSupported: row.format !== 'ass',
    language: row.language
  }))

  return c.json({ ...movie, subtitles })
})

export { libraryRoutes }
