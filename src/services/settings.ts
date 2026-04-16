import { eq } from 'drizzle-orm'
import { log } from 'tiny-typescript-logger'

import { getConfig, saveConfig } from '../config'
import { db, schema } from '../database'

export const tmdbApiKeySettingKey = 'tmdbApiKey'
export const scanScheduleSettingKey = 'scanSchedule'

export type ScanScheduleValue = 'off' | '6h' | '12h' | '24h'

export const scanScheduleValues: readonly ScanScheduleValue[] = [
  'off',
  '6h',
  '12h',
  '24h'
]

export const defaultScanSchedule: ScanScheduleValue = 'off'

export function isScanScheduleValue(
  value: string
): value is ScanScheduleValue {
  return scanScheduleValues.includes(value as ScanScheduleValue)
}

/**
 * Read a setting value from the DB. Returns null when the key is not set.
 *
 * Accepts an optional database instance so tests and scripts can pass an
 * in-memory SQLite instance instead of the singleton.
 */
export async function getSetting(
  key: string,
  database: typeof db = db
): Promise<string | null> {
  const [row] = await database
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1)

  return row?.value ?? null
}

/**
 * Upsert a setting value.
 *
 * Uses a single INSERT ... ON CONFLICT so two concurrent callers don't both
 * read null, both INSERT, and fail with a UNIQUE constraint on the second.
 */
export async function setSetting(
  key: string,
  value: string,
  database: typeof db = db
): Promise<void> {
  const now = Date.now()

  await database
    .insert(schema.settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: now }
    })
}

/**
 * Resolve the TMDB API key using the dual-source strategy:
 *
 * 1. Prefer the value stored in the `settings` table.
 * 2. Fall back to `~/.jukebox/config.json` for backward compatibility on the
 *    first boot after upgrading. Copy the JSON value into the DB once so
 *    subsequent lookups only touch the DB.
 *
 * Returns null when neither source has a key configured.
 */
export async function getTmdbApiKey(
  database: typeof db = db
): Promise<string | null> {
  const stored = await getSetting(tmdbApiKeySettingKey, database)

  if (stored !== null && stored.length > 0) {
    return stored
  }

  const jsonConfig = getConfig()
  const legacyKey = jsonConfig?.tmdbApiKey ?? null

  if (legacyKey !== null && legacyKey.length > 0) {
    await setSetting(tmdbApiKeySettingKey, legacyKey, database)

    return legacyKey
  }

  return null
}

/**
 * Persist the TMDB API key to the DB. Also mirror the value to the JSON
 * config file so rollbacks to an older server build keep working.
 */
export async function setTmdbApiKey(
  apiKey: string,
  database: typeof db = db
): Promise<void> {
  await setSetting(tmdbApiKeySettingKey, apiKey, database)

  try {
    await saveConfig({ tmdbApiKey: apiKey })
  } catch (error) {
    // Saving to the JSON file is best-effort — the DB is the source of
    // truth after the first migration. Don't re-throw so a read-only
    // config directory doesn't break settings updates, but do log so the
    // user has a signal that rollback safety to an older server build is
    // degraded.
    log.warn(
      "Couldn't mirror TMDB key to config.json — rollback safety is degraded. Check permissions on ~/.jukebox/.",
      error
    )
  }
}
