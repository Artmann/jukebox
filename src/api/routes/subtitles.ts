import { readFile } from 'fs/promises'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { log } from 'tiny-typescript-logger'

import { db, schema } from '../../database'
import { convertSrtToVtt } from '../../services/subtitles'

const subtitleRoutes = new Hono()

const conversionFailedMessage =
  "Couldn't convert subtitle file. Check it's a valid SRT."

// GET /:id - Stream the subtitle file as WebVTT.
//
// .vtt files are served as-is. .srt files are converted on the fly because
// browsers don't natively support SubRip. .ass is rejected — we surface those
// in the player UI as "(unsupported format)" so this route should never be
// hit for them in practice.
subtitleRoutes.get('/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: { message: 'Invalid subtitle ID' } }, 400)
  }

  const [subtitle] = await db
    .select()
    .from(schema.subtitles)
    .where(eq(schema.subtitles.id, id))
    .limit(1)

  if (!subtitle) {
    return context.json({ error: { message: 'Subtitle not found' } }, 404)
  }

  if (subtitle.format === 'ass') {
    return context.text(
      "ASS subtitles aren't supported by the web player. Convert the file to .srt or .vtt and rescan.",
      415
    )
  }

  let raw: string

  try {
    raw = await readFile(subtitle.filePath, 'utf-8')
  } catch (error) {
    log.warn(
      `Couldn't read subtitle file ${subtitle.filePath} - ${
        error instanceof Error ? error.message : String(error)
      }. Make sure the file still exists at that path and rescan the library.`
    )

    return context.text(conversionFailedMessage, 500)
  }

  if (subtitle.format === 'vtt') {
    return new Response(raw, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'text/vtt; charset=utf-8'
      }
    })
  }

  // Format must be 'srt' at this point.
  let converted: string

  try {
    converted = convertSrtToVtt(raw)
  } catch (error) {
    log.warn(
      `Couldn't convert subtitle file ${subtitle.filePath} to WebVTT - ${
        error instanceof Error ? error.message : String(error)
      }. Convert the file to UTF-8 .vtt and rescan.`
    )

    return context.text(conversionFailedMessage, 500)
  }

  return new Response(converted, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/vtt; charset=utf-8'
    }
  })
})

export { subtitleRoutes }
