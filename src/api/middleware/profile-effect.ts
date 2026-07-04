import { HttpApp, HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { desc, eq } from 'drizzle-orm'
import { Duration, Effect, Layer } from 'effect'

import { Database, type DrizzleDatabase } from '../../database/layer'
import * as schema from '../../database/schema'
import { ProfileMiddleware } from '../contract/middleware'
import { internalTryPromise } from '../handlers/support'

export const profileCookieName = 'jukebox_profile_id'

const oneYearSeconds = 60 * 60 * 24 * 365

// Same attributes as Hono's setProfileCookie: httpOnly, one year, path '/',
// SameSite=Lax, no Secure flag.
export const appendProfileCookie = (profileId: number) =>
  HttpApp.appendPreResponseHandler((_request, response) =>
    Effect.succeed(
      HttpServerResponse.unsafeSetCookie(
        response,
        profileCookieName,
        String(profileId),
        {
          httpOnly: true,
          maxAge: Duration.seconds(oneYearSeconds),
          path: '/',
          sameSite: 'lax'
        }
      )
    )
  )

const readProfileFromCookie = (
  db: DrizzleDatabase,
  rawCookieValue: string | undefined
) =>
  Effect.gen(function* () {
    if (!rawCookieValue) {
      return null
    }

    const parsedId = parseInt(rawCookieValue, 10)

    if (isNaN(parsedId)) {
      return null
    }

    const [profile] = yield* internalTryPromise(() =>
      db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, parsedId))
        .limit(1)
    )

    return profile ?? null
  })

const fallbackProfile = (db: DrizzleDatabase) =>
  internalTryPromise(async () => {
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
  })

// Ports src/api/middleware/profile.ts: resolve the profile from the cookie,
// fall back to the newest profile (creating 'Default' when none exist), and
// set the cookie whenever the incoming one was missing or stale.
export const ProfileMiddlewareLive = Layer.effect(
  ProfileMiddleware,
  Effect.gen(function* () {
    const db = yield* Database

    return Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const cookieValue = request.cookies[profileCookieName]
      const fromCookie = yield* readProfileFromCookie(db, cookieValue)
      const profile = fromCookie ?? (yield* fallbackProfile(db))

      if (!fromCookie || fromCookie.id !== profile.id) {
        yield* appendProfileCookie(profile.id)
      }

      return { id: profile.id }
    })
  })
)
