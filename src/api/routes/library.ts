import { Hono } from 'hono'
import { db, schema } from '../../database'
import { eq } from 'drizzle-orm'

const libraryRoutes = new Hono()

// GET /api/library/movies - List all movies
libraryRoutes.get('/movies', async (c) => {
  const movies = await db.select().from(schema.movies).orderBy(schema.movies.title)
  return c.json(movies)
})

// GET /api/library/movies/:id - Get single movie
libraryRoutes.get('/movies/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)

  if (isNaN(id)) {
    return c.json({ error: 'Invalid movie ID' }, 400)
  }

  const movie = await db
    .select()
    .from(schema.movies)
    .where(eq(schema.movies.id, id))
    .limit(1)

  if (movie.length === 0) {
    return c.json({ error: 'Movie not found' }, 404)
  }

  return c.json(movie[0])
})

export { libraryRoutes }
