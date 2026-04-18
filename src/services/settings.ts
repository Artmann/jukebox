import { eq } from 'drizzle-orm'

import { db, schema } from '../database'

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
