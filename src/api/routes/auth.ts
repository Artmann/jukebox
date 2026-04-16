import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import invariant from 'tiny-invariant'

import { db, schema } from '../../database'

export const sessionCookieName = 'jukebox_session'
export const sessionLifetimeDays = 30
export const minimumPasswordLength = 8
export const rateLimitAttempts = 5
export const rateLimitWindowMinutes = 15

const rateLimitWindowMs = rateLimitWindowMinutes * 60 * 1000

type RateLimitEntry = {
  attempts: number[]
}

const rateLimitBuckets = new Map<string, RateLimitEntry>()

function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return headers.get('x-real-ip') ?? 'unknown'
}

export function resetRateLimit(): void {
  rateLimitBuckets.clear()
}

function checkRateLimit(ip: string): {
  allowed: boolean
  retryAfterSeconds: number
} {
  const now = Date.now()
  const cutoff = now - rateLimitWindowMs
  const entry = rateLimitBuckets.get(ip) ?? { attempts: [] }

  entry.attempts = entry.attempts.filter((time) => time > cutoff)

  if (entry.attempts.length >= rateLimitAttempts) {
    const oldest = entry.attempts[0] ?? now
    const retryAfterMs = oldest + rateLimitWindowMs - now
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))

    rateLimitBuckets.set(ip, entry)

    return { allowed: false, retryAfterSeconds }
  }

  rateLimitBuckets.set(ip, entry)

  return { allowed: true, retryAfterSeconds: 0 }
}

function recordFailedAttempt(ip: string): void {
  const entry = rateLimitBuckets.get(ip) ?? { attempts: [] }

  entry.attempts.push(Date.now())

  rateLimitBuckets.set(ip, entry)
}

function clearAttempts(ip: string): void {
  rateLimitBuckets.delete(ip)
}

async function loadAuthConfig(): Promise<schema.AuthConfig> {
  const [existing] = await db
    .select()
    .from(schema.authConfig)
    .where(eq(schema.authConfig.id, 1))
    .limit(1)

  if (existing) {
    return existing
  }

  const [created] = await db
    .insert(schema.authConfig)
    .values({ id: 1, passwordHash: null, updatedAt: Date.now() })
    .returning()

  invariant(created, 'Failed to initialize auth config.')

  return created
}

const scryptKeyLength = 64

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, scryptKeyLength)

  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
}

async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split('$')

  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false
  }

  try {
    const salt = Buffer.from(parts[1] ?? '', 'base64')
    const expected = Buffer.from(parts[2] ?? '', 'base64')
    const derived = await scryptAsync(password, salt, expected.length)

    if (derived.length !== expected.length) {
      return false
    }

    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

async function createSession(userAgent: string | null): Promise<string> {
  const now = dayjs()
  const token = createSessionToken()

  await db.insert(schema.sessions).values({
    id: token,
    createdAt: now.valueOf(),
    expiresAt: now.add(sessionLifetimeDays, 'day').valueOf(),
    lastSeenAt: now.valueOf(),
    userAgent
  })

  return token
}

async function deleteAllSessions(): Promise<void> {
  await db.delete(schema.sessions)
}

async function deleteSession(id: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id))
}

function sessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    maxAge: sessionLifetimeDays * 24 * 60 * 60,
    path: '/',
    sameSite: 'Lax' as const,
    secure: isProduction
  }
}

const authRoutes = new Hono()

authRoutes.get('/status', async (context) => {
  const config = await loadAuthConfig()
  const enabled = config.passwordHash !== null

  if (!enabled) {
    return context.json({ enabled: false, authenticated: true })
  }

  const cookie = getCookie(context, sessionCookieName)

  if (!cookie) {
    return context.json({ enabled: true, authenticated: false })
  }

  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, cookie))
    .limit(1)

  const authenticated =
    session !== undefined && session.expiresAt > Date.now()

  return context.json({ enabled: true, authenticated })
})

authRoutes.post('/login', async (context) => {
  const ip = clientIp(context.req.raw.headers)
  const limit = checkRateLimit(ip)

  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60)

    context.header('Retry-After', String(limit.retryAfterSeconds))

    return context.json(
      {
        error: {
          message: `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
        }
      },
      429
    )
  }

  let body: { password?: unknown }

  try {
    body = await context.req.json<{ password?: unknown }>()
  } catch {
    return context.json(
      { error: { message: 'Invalid request body.' } },
      400
    )
  }

  const password = typeof body.password === 'string' ? body.password : ''

  if (password.length === 0) {
    return context.json(
      { error: { message: 'Incorrect password.' } },
      401
    )
  }

  const config = await loadAuthConfig()

  if (config.passwordHash === null) {
    return context.json(
      { error: { message: 'Password login is disabled on this server.' } },
      400
    )
  }

  const valid = await verifyPassword(password, config.passwordHash)

  if (!valid) {
    recordFailedAttempt(ip)

    return context.json(
      { error: { message: 'Incorrect password.' } },
      401
    )
  }

  clearAttempts(ip)

  const userAgent = context.req.header('user-agent') ?? null
  const token = await createSession(userAgent)

  setCookie(context, sessionCookieName, token, sessionCookieOptions())

  return context.body(null, 204)
})

authRoutes.post('/logout', async (context) => {
  const token = getCookie(context, sessionCookieName)

  if (token) {
    await deleteSession(token)
  }

  deleteCookie(context, sessionCookieName, { path: '/' })

  return context.body(null, 204)
})

authRoutes.post('/password', async (context) => {
  let body: { currentPassword?: unknown; newPassword?: unknown }

  try {
    body = await context.req.json<{
      currentPassword?: unknown
      newPassword?: unknown
    }>()
  } catch {
    return context.json(
      { error: { message: 'Invalid request body.' } },
      400
    )
  }

  const newPassword =
    typeof body.newPassword === 'string' ? body.newPassword : ''
  const currentPassword =
    typeof body.currentPassword === 'string' ? body.currentPassword : ''

  const config = await loadAuthConfig()
  const isEnabled = config.passwordHash !== null

  if (isEnabled) {
    const valid = await verifyPassword(currentPassword, config.passwordHash ?? '')

    if (!valid) {
      return context.json(
        { error: { message: 'Current password is incorrect.' } },
        401
      )
    }
  }

  if (newPassword.length === 0) {
    await db
      .update(schema.authConfig)
      .set({ passwordHash: null, updatedAt: Date.now() })
      .where(eq(schema.authConfig.id, 1))

    await deleteAllSessions()
    deleteCookie(context, sessionCookieName, { path: '/' })

    return context.json({ enabled: false })
  }

  if (newPassword.length < minimumPasswordLength) {
    return context.json(
      {
        error: {
          message: `Choose a password of at least ${minimumPasswordLength} characters.`
        }
      },
      400
    )
  }

  const hash = await hashPassword(newPassword)

  await db
    .update(schema.authConfig)
    .set({ passwordHash: hash, updatedAt: Date.now() })
    .where(eq(schema.authConfig.id, 1))

  await deleteAllSessions()

  const userAgent = context.req.header('user-agent') ?? null
  const token = await createSession(userAgent)

  setCookie(context, sessionCookieName, token, sessionCookieOptions())

  return context.json({ enabled: true })
})

export { authRoutes }
