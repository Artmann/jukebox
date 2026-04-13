import { createReadStream, existsSync, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import invariant from 'tiny-invariant'

import { db, schema } from '../../database'

const mimeTypes: Record<string, string> = {
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()

  return mimeTypes[extension] ?? 'video/mp4'
}

const episodeStreamRoutes = new Hono()

// GET /:id - Stream episode file
episodeStreamRoutes.get('/:id', async (context) => {
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

  const filePath = episode.filePath

  if (!existsSync(filePath)) {
    return context.json({ error: { message: 'Video file not found' } }, 404)
  }

  const fileSize = statSync(filePath).size
  const mimeType = getMimeType(filePath)
  const range = context.req.header('range')

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')

    invariant(parts[0], 'Invalid Range header')

    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const nodeStream = createReadStream(filePath, { start, end })
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': mimeType,
      },
    })
  }

  const nodeStream = createReadStream(filePath)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream

  return new Response(webStream, {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    },
  })
})

export { episodeStreamRoutes }
