import { access } from 'fs/promises'
import { constants } from 'fs'
import path from 'path'

import { eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'
import { scheduler } from '../../services/scheduler'
import {
  defaultScanSchedule,
  getSetting,
  isScanScheduleValue,
  scanScheduleSettingKey,
  setSetting
} from '../../services/settings'

// Keys that have dedicated routes with their own validation. The generic
// /:key handlers must not read or write these or they bypass those
// validators (e.g. writing "garbage" to scanSchedule).
const reservedKeys = new Set<string>([scanScheduleSettingKey])

const reservedKeyRoute: Record<string, string> = {
  [scanScheduleSettingKey]: '/api/settings/scan-schedule'
}

interface LibraryInput {
  name: string
  path: string
  type: 'movies' | 'shows'
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
  const libraryPath = typeof record.path === 'string' ? record.path.trim() : ''
  const type = record.type

  if (libraryPath.length === 0) {
    return 'Library path is required.'
  }

  if (type !== 'movies' && type !== 'shows') {
    return 'Library type must be "movies" or "shows".'
  }

  return { name, path: libraryPath, type }
}

/**
 * Build the LIKE pattern that matches any file path under the given library
 * root. Escapes SQL LIKE wildcards so a path containing `%` or `_` doesn't
 * accidentally match siblings.
 */
function libraryPathPrefixPattern(libraryPath: string): string {
  const resolved = path.resolve(libraryPath)
  const withSeparator = resolved.endsWith(path.sep)
    ? resolved
    : `${resolved}${path.sep}`

  // Escape LIKE meta-characters (`%`, `_`) and the escape character itself.
  const escaped = withSeparator
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')

  return `${escaped}%`
}

const settingsRoutes = new Hono()

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
  const pattern = libraryPathPrefixPattern(existing.path)

  if (!force) {
    const referenceCount = countLibraryReferences(existing, pattern)

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

    db.delete(schema.libraries).where(eq(schema.libraries.id, id)).run()

    return context.json({ success: true })
  }

  // Force remove: cascade-delete the library's rows and the library itself
  // atomically so a crash mid-flight can't leave orphans. `db.transaction`
  // requires a synchronous callback for better-sqlite3, so every query uses
  // `.run()` / `.all()` (no `await`).
  db.transaction((tx) => {
    if (existing.type === 'movies') {
      const movieIds = tx
        .select({ id: schema.movies.id })
        .from(schema.movies)
        .where(
          sql`${schema.movies.filePath} LIKE ${pattern} ESCAPE '\\'`
        )
        .all()
        .map((row) => row.id)

      if (movieIds.length > 0) {
        tx.delete(schema.watchProgress)
          .where(inArray(schema.watchProgress.movieId, movieIds))
          .run()

        tx.delete(schema.movies)
          .where(inArray(schema.movies.id, movieIds))
          .run()
      }
    } else {
      const showIds = tx
        .select({ id: schema.shows.id })
        .from(schema.shows)
        .where(
          sql`${schema.shows.folderPath} LIKE ${pattern} ESCAPE '\\'`
        )
        .all()
        .map((row) => row.id)

      if (showIds.length > 0) {
        const episodeIds = tx
          .select({ id: schema.episodes.id })
          .from(schema.episodes)
          .where(inArray(schema.episodes.showId, showIds))
          .all()
          .map((row) => row.id)

        if (episodeIds.length > 0) {
          tx.delete(schema.watchProgress)
            .where(inArray(schema.watchProgress.episodeId, episodeIds))
            .run()

          tx.delete(schema.episodes)
            .where(inArray(schema.episodes.id, episodeIds))
            .run()
        }

        tx.delete(schema.seasons)
          .where(inArray(schema.seasons.showId, showIds))
          .run()

        tx.delete(schema.shows)
          .where(inArray(schema.shows.id, showIds))
          .run()
      }
    }

    tx.delete(schema.libraries).where(eq(schema.libraries.id, id)).run()
  })

  return context.json({ success: true })
})

function countLibraryReferences(
  library: schema.Library,
  pattern: string
): number {
  if (library.type === 'movies') {
    const [row] = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.movies)
      .where(sql`${schema.movies.filePath} LIKE ${pattern} ESCAPE '\\'`)
      .all()

    return row?.count ?? 0
  }

  const [row] = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.shows)
    .where(sql`${schema.shows.folderPath} LIKE ${pattern} ESCAPE '\\'`)
    .all()

  return row?.count ?? 0
}

settingsRoutes.get('/scan-schedule', async (context) => {
  const stored = await getSetting(scanScheduleSettingKey)
  const value =
    stored !== null && isScanScheduleValue(stored) ? stored : defaultScanSchedule

  const info = scheduler.getInfo()

  return context.json({
    nextRunAt: info.nextRunAt?.toISOString() ?? null,
    schedule: value
  })
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
  scheduler.updateSchedule(schedule)

  const info = scheduler.getInfo()

  return context.json({
    nextRunAt: info.nextRunAt?.toISOString() ?? null,
    schedule
  })
})

// keep generic /:key routes last — Hono matches in declaration order
settingsRoutes.get('/:key', async (context) => {
  const key = context.req.param('key')

  if (reservedKeys.has(key)) {
    return context.json(
      {
        error: {
          message: `Use GET ${reservedKeyRoute[key]} for this key.`
        }
      },
      400
    )
  }

  const value = await getSetting(key)

  if (value === null) {
    return context.json({ value: null })
  }

  return context.json({ value })
})

settingsRoutes.put('/:key', async (context) => {
  const key = context.req.param('key')

  if (reservedKeys.has(key)) {
    return context.json(
      {
        error: {
          message: `Use PUT ${reservedKeyRoute[key]} for this key.`
        }
      },
      400
    )
  }

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
