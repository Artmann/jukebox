import { desc, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie } from 'hono/cookie'

import { db, schema } from '../../database'

export const profileCookieName = 'jukebox_profile_id'
const oneYearSeconds = 60 * 60 * 24 * 365

export type ProfileContext = {
  Variables: {
    profileId: number
  }
}

export function setProfileCookie(context: Context, profileId: number): void {
  setCookie(context, profileCookieName, String(profileId), {
    httpOnly: true,
    maxAge: oneYearSeconds,
    path: '/',
    sameSite: 'Lax'
  })
}

async function readProfileFromCookie(
  rawCookieValue: string | undefined
): Promise<schema.Profile | null> {
  if (!rawCookieValue) {
    return null
  }

  const parsedId = parseInt(rawCookieValue, 10)

  if (isNaN(parsedId)) {
    return null
  }

  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, parsedId))
    .limit(1)

  return profile ?? null
}

async function fallbackProfile(): Promise<schema.Profile> {
  const [latest] = await db
    .select()
    .from(schema.profiles)
    .orderBy(desc(schema.profiles.createdAt))
    .limit(1)

  if (latest) {
    return latest
  }

  const now = new Date()

  const [created] = await db
    .insert(schema.profiles)
    .values({ name: 'Default', emoji: '🍿', createdAt: now })
    .returning()

  if (!created) {
    throw new Error('Failed to create default profile')
  }

  return created
}

export const profileMiddleware = createMiddleware<ProfileContext>(
  async (context, next) => {
    const cookieValue = getCookie(context, profileCookieName)
    const fromCookie = await readProfileFromCookie(cookieValue)
    const profile = fromCookie ?? (await fallbackProfile())

    if (!fromCookie || fromCookie.id !== profile.id) {
      setProfileCookie(context, profile.id)
    }

    context.set('profileId', profile.id)

    await next()
  }
)
