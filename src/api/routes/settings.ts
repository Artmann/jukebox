import { access } from 'fs/promises'
import { constants } from 'fs'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'
import {
  defaultScanSchedule,
  getSetting,
  getTmdbApiKey,
  isScanScheduleValue,
  scanScheduleSettingKey,
  setSetting,
  setTmdbApiKey
} from '../../services/settings'

const tmdbConfigurationUrl = 'https://api.themoviedb.org/3/configuration'

interface LibraryInput {
  name: string
  path: string
  type: 'movies' | 'shows'
}

async function verifyTmdbKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${tmdbConfigurationUrl}?api_key=${encodeURIComponent(apiKey)}`
    )

    return response.ok
  } catch {
    return false
  }
}

async function pathIsReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)

    return true
  } catch {
    return false
  }
}

function validateLibraryInput(input: unknown): LibraryInput | string {
  if (typeof input !== 'object' || input === null) {
    return 'Library entry must be an object.'
  }

  const record = input as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const path = typeof record.path === 'string' ? record.path.trim() : ''
  const type = record.type

  if (path.length === 0) {
    return 'Library path is required.'
  }

  if (type !== 'movies' && type !== 'shows') {
    return 'Library type must be "movies" or "shows".'
  }

  return { name, path, type }
}

const settingsRoutes = new Hono()

settingsRoutes.get('/tmdb-key', async (context) => {
  const apiKey = await getTmdbApiKey()

  return context.json({
    configured: apiKey !== null && apiKey.length > 0,
    apiKey: apiKey ?? ''
  })
})

settingsRoutes.put('/tmdb-key', async (context) => {
  let body: { apiKey?: unknown }

  try {
    body = await context.req.json<{ apiKey?: unknown }>()
  } catch {
    return context.json({ error: { message: 'Invalid request body.' } }, 400)
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''

  if (apiKey.length === 0) {
    return context.json(
      {
        error: {
          message:
            'TMDB API key is required. Get one at themoviedb.org/settings/api.'
        }
      },
      400
    )
  }

  const valid = await verifyTmdbKey(apiKey)

  if (!valid) {
    return context.json(
      {
        error: {
          message:
            "Couldn't save TMDB key — the key wasn't accepted by TMDB. Check it at themoviedb.org/settings/api."
        }
      },
      400
    )
  }

  await setTmdbApiKey(apiKey)

  return context.json({ configured: true })
})

settingsRoutes.get('/libraries', async (context) => {
  const libraries = await db.select().from(schema.libraries)

  return context.json(
    libraries.map((library) => ({
      id: library.id,
      name: library.name,
      path: library.path,
      type: library.type
    }))
  )
})

settingsRoutes.post('/libraries', async (context) => {
  let body: unknown

  try {
    body = await context.req.json<unknown>()
  } catch {
    return context.json({ error: { message: 'Invalid request body.' } }, 400)
  }

  const parsed = validateLibraryInput(body)

  if (typeof parsed === 'string') {
    return context.json({ error: { message: parsed } }, 400)
  }

  const readable = await pathIsReadable(parsed.path)

  if (!readable) {
    return context.json(
      {
        error: {
          message: `Library path doesn't exist or isn't readable: ${parsed.path}. Check the path and Jukebox's file permissions.`
        }
      },
      400
    )
  }

  const [existing] = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.path, parsed.path))
    .limit(1)

  if (existing) {
    return context.json(
      {
        error: {
          message: `A library at ${parsed.path} already exists.`
        }
      },
      400
    )
  }

  const resolvedName =
    parsed.name.length > 0
      ? parsed.name
      : (parsed.path.split(/[\\/]/).filter(Boolean).pop() ?? parsed.type)

  const [created] = await db
    .insert(schema.libraries)
    .values({
      name: resolvedName,
      path: parsed.path,
      type: parsed.type,
      createdAt: new Date()
    })
    .returning()

  if (!created) {
    return context.json(
      { error: { message: 'Failed to create library.' } },
      500
    )
  }

  return context.json(
    {
      id: created.id,
      name: created.name,
      path: created.path,
      type: created.type
    },
    201
  )
})

settingsRoutes.delete('/libraries/:id', async (context) => {
  const id = Number.parseInt(context.req.param('id'), 10)

  if (!Number.isFinite(id)) {
    return context.json({ error: { message: 'Invalid library id.' } }, 400)
  }

  const [existing] = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.id, id))
    .limit(1)

  if (!existing) {
    return context.json(
      { error: { message: 'Library not found.' } },
      404
    )
  }

  const url = new URL(context.req.url)
  const force = url.searchParams.get('force') === 'true'

  if (!force) {
    const referenceCount = await countLibraryReferences(existing)

    if (referenceCount > 0) {
      const noun =
        existing.type === 'movies'
          ? referenceCount === 1
            ? 'movie'
            : 'movies'
          : referenceCount === 1
            ? 'show'
            : 'shows'

      return context.json(
        {
          error: {
            message: `Couldn't remove library — ${referenceCount} ${noun} reference it. Remove them first or use 'Force remove'.`,
            referenceCount
          }
        },
        409
      )
    }
  }

  if (force) {
    await deleteLibraryReferences(existing)
  }

  await db.delete(schema.libraries).where(eq(schema.libraries.id, id))

  return context.json({ success: true })
})

function pathIsUnderLibrary(subject: string, libraryPath: string): boolean {
  if (subject === libraryPath) {
    return true
  }

  const normalizedLibrary = libraryPath.endsWith('/') || libraryPath.endsWith('\\')
    ? libraryPath
    : `${libraryPath}${libraryPath.includes('\\') ? '\\' : '/'}`

  return subject.startsWith(normalizedLibrary)
}

async function countLibraryReferences(
  library: schema.Library
): Promise<number> {
  if (library.type === 'movies') {
    const rows = await db.select().from(schema.movies)

    return rows.filter((movie) =>
      pathIsUnderLibrary(movie.filePath, library.path)
    ).length
  }

  const rows = await db.select().from(schema.shows)

  return rows.filter((show) =>
    pathIsUnderLibrary(show.folderPath, library.path)
  ).length
}

async function deleteLibraryReferences(
  library: schema.Library
): Promise<void> {
  if (library.type === 'movies') {
    const rows = await db.select().from(schema.movies)

    for (const movie of rows) {
      if (pathIsUnderLibrary(movie.filePath, library.path)) {
        await db.delete(schema.movies).where(eq(schema.movies.id, movie.id))
      }
    }

    return
  }

  const rows = await db.select().from(schema.shows)

  for (const show of rows) {
    if (!pathIsUnderLibrary(show.folderPath, library.path)) {
      continue
    }

    await db
      .delete(schema.episodes)
      .where(eq(schema.episodes.showId, show.id))
    await db
      .delete(schema.seasons)
      .where(eq(schema.seasons.showId, show.id))
    await db.delete(schema.shows).where(eq(schema.shows.id, show.id))
  }
}

settingsRoutes.get('/scan-schedule', async (context) => {
  const stored = await getSetting(scanScheduleSettingKey)
  const value =
    stored !== null && isScanScheduleValue(stored) ? stored : defaultScanSchedule

  return context.json({ schedule: value })
})

settingsRoutes.put('/scan-schedule', async (context) => {
  let body: { schedule?: unknown }

  try {
    body = await context.req.json<{ schedule?: unknown }>()
  } catch {
    return context.json({ error: { message: 'Invalid request body.' } }, 400)
  }

  const schedule =
    typeof body.schedule === 'string' ? body.schedule.trim() : ''

  if (!isScanScheduleValue(schedule)) {
    return context.json(
      {
        error: {
          message:
            'Scan schedule must be one of: off, 6h, 12h, 24h.'
        }
      },
      400
    )
  }

  await setSetting(scanScheduleSettingKey, schedule)

  return context.json({ schedule })
})

settingsRoutes.get('/:key', async (context) => {
  const key = context.req.param('key')
  const value = await getSetting(key)

  if (value === null) {
    return context.json({ value: null })
  }

  return context.json({ value })
})

settingsRoutes.put('/:key', async (context) => {
  const key = context.req.param('key')
  let body: { value?: unknown }

  try {
    body = await context.req.json<{ value?: unknown }>()
  } catch {
    return context.json({ error: { message: 'Invalid request body.' } }, 400)
  }

  if (typeof body.value !== 'string') {
    return context.json(
      { error: { message: 'Setting value must be a string.' } },
      400
    )
  }

  await setSetting(key, body.value)

  return context.json({ value: body.value })
})

export { settingsRoutes }
