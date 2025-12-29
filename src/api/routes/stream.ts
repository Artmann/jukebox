import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import invariant from 'tiny-invariant'

import { db, schema } from '../../database'

const streamRoutes = new Hono()

// GET /api/stream/:id - Stream video file
streamRoutes.get('/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: 'Invalid movie ID' }, 400)
  }

  const [movie] = await db
    .select()
    .from(schema.movies)
    .where(eq(schema.movies.id, id))
    .limit(1)

  if (!movie) {
    return context.json({ error: 'Movie not found' }, 404)
  }

  const filePath = movie.filePath
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    return context.json({ error: 'Video file not found' }, 404)
  }

  const fileSize = file.size
  const mimeType = file.type || 'video/mp4'
  const range = context.req.header('range')

  if (range) {
    // Handle range request for video seeking
    const parts = range.replace(/bytes=/, '').split('-')

    invariant(parts[0], 'Invalid Range header')

    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const stream = file.slice(start, end + 1).stream()

    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': mimeType
      }
    })
  }

  // No range request - return full file
  return new Response(file.stream(), {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes'
    }
  })
})

export { streamRoutes }
