import { readFile } from 'fs/promises'
import path from 'path'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { log } from 'tiny-typescript-logger'

import { db, schema } from '../../database'
import { convertSrtToVtt } from '../../services/subtitles'

const subtitleRoutes = new Hono()

const conversionFailedMessage =
  "Couldn't convert subtitle file. Check it's a valid SRT."

const outsideLibraryMessage =
  'Subtitle is outside the configured library paths. Rescan your libraries.'

// Defense-in-depth: even though the scanner only writes sidecar paths that sit
// under a configured library, confirm the stored path still resolves under one
// of them before handing it to readFile. Guards against library removal,
// manual DB edits, and path traversal via legacy rows.
function subtitleIsInsideALibrary(
  subtitleFilePath: string,
  libraryPaths: string[]
): boolean {
  const resolvedSubtitle = path.resolve(subtitleFilePath)

  for (const libraryPath of libraryPaths) {
    const resolvedLibrary = path.resolve(libraryPath)
    const libraryWithSeparator = resolvedLibrary.endsWith(path.sep)
      ? resolvedLibrary
      : `${resolvedLibrary}${path.sep}`

    if (resolvedSubtitle.startsWith(libraryWithSeparator)) {
      return true
    }
  }

  return false
}

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

  const libraries = await db
    .select({ path: schema.libraries.path })
    .from(schema.libraries)

  const libraryPaths = libraries.map((library) => library.path)

  if (!subtitleIsInsideALibrary(subtitle.filePath, libraryPaths)) {
    // Return 404 (not 500) so we don't disclose that the row exists but sits
    // outside a configured library.
    log.warn(
      `Refusing to serve subtitle ${subtitle.id} — ${subtitle.filePath} is not inside any configured library. Rescan the library to clean up stale rows.`
    )

    return context.json({ error: { message: outsideLibraryMessage } }, 404)
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
