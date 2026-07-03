import { eq, lt } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'

import { db, schema } from '../../database'
import { sessionCookieName } from '../routes/auth'

const lastSeenThrottleMs = 60 * 1000
let lastSweepAt = 0
const sweepIntervalMs = 5 * 60 * 1000

async function sweepExpiredSessions(now: number): Promise<void> {
  if (now - lastSweepAt < sweepIntervalMs) {
    return
  }

  lastSweepAt = now

  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now))
}

export const authMiddleware = createMiddleware(async (context, next) => {
  const pathname = new URL(context.req.url).pathname

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/setup')
  ) {
    return next()
  }

  const [config] = await db
    .select()
    .from(schema.authConfig)
    .where(eq(schema.authConfig.id, 1))
    .limit(1)

  if (!config || config.passwordHash === null) {
    return next()
  }

  const token = getCookie(context, sessionCookieName)

  if (!token) {
    return context.json(
      { error: { message: 'Authentication required.' } },
      401
    )
  }

  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, token))
    .limit(1)

  const now = Date.now()

  if (!session || session.expiresAt <= now) {
    if (session) {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.id, session.id))
    }

    return context.json(
      { error: { message: 'Your session has expired. Please sign in again.' } },
      401
    )
  }

  await sweepExpiredSessions(now)

  if (now - session.lastSeenAt > lastSeenThrottleMs) {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: now })
      .where(eq(schema.sessions.id, session.id))
  }

  return next()
})
