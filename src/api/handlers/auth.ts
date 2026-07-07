import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

import {
  HttpApiBuilder,
  HttpApp,
  HttpServerRequest,
  HttpServerResponse
} from '@effect/platform'
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { Duration, Effect, HashMap, Option, Ref } from 'effect'
import invariant from 'tiny-invariant'

import { Database, type DrizzleDatabase } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import { BadRequest, TooManyRequests, Unauthorized } from '../contract/errors'

import { internalTryPromise, withHandlerSpan } from './support'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>

export const minimumPasswordLength = 8
export const rateLimitAttempts = 5
export const rateLimitWindowMinutes = 15
export const sessionCookieName = 'jukebox_session'
export const sessionLifetimeDays = 30

const rateLimitWindowMs = rateLimitWindowMinutes * 60 * 1000
const scryptKeyLength = 64

type RateLimitBuckets = HashMap.HashMap<string, ReadonlyArray<number>>

function clientIp(headers: Readonly<Record<string, string | undefined>>): string {
  const forwarded = headers['x-forwarded-for']

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return headers['x-real-ip'] ?? 'unknown'
}

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

export const loadAuthConfig = (db: DrizzleDatabase) =>
  internalTryPromise(async () => {
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
  })

const createSession = (db: DrizzleDatabase, userAgent: string | null) =>
  internalTryPromise(async () => {
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
  })

function sessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    maxAge: Duration.seconds(sessionLifetimeDays * 24 * 60 * 60),
    path: '/',
    sameSite: 'lax' as const,
    secure: isProduction
  }
}

const setSessionCookie = (token: string) =>
  HttpApp.appendPreResponseHandler((_request, response) =>
    Effect.succeed(
      HttpServerResponse.unsafeSetCookie(
        response,
        sessionCookieName,
        token,
        sessionCookieOptions()
      )
    )
  )

// Hono's deleteCookie sends an empty value with Max-Age=0 and Path=/.
const clearSessionCookie = HttpApp.appendPreResponseHandler(
  (_request, response) =>
    Effect.succeed(
      HttpServerResponse.unsafeSetCookie(response, sessionCookieName, '', {
        maxAge: Duration.zero,
        path: '/'
      })
    )
)

const checkRateLimit = (ref: Ref.Ref<RateLimitBuckets>, ip: string) =>
  Ref.modify(ref, (buckets) => {
    const now = Date.now()
    const cutoff = now - rateLimitWindowMs
    const attempts = HashMap.get(buckets, ip).pipe(
      Option.getOrElse((): ReadonlyArray<number> => [])
    ).filter((time) => time > cutoff)

    if (attempts.length >= rateLimitAttempts) {
      const oldest = attempts[0] ?? now
      const retryAfterMs = oldest + rateLimitWindowMs - now
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))

      return [
        { allowed: false, retryAfterSeconds },
        HashMap.set(buckets, ip, attempts)
      ]
    }

    return [
      { allowed: true, retryAfterSeconds: 0 },
      HashMap.set(buckets, ip, attempts)
    ]
  })

const recordFailedAttempt = (ref: Ref.Ref<RateLimitBuckets>, ip: string) =>
  Ref.update(ref, (buckets) => {
    const attempts = HashMap.get(buckets, ip).pipe(
      Option.getOrElse((): ReadonlyArray<number> => [])
    )

    return HashMap.set(buckets, ip, [...attempts, Date.now()])
  })

const clearAttempts = (ref: Ref.Ref<RateLimitBuckets>, ip: string) =>
  Ref.update(ref, HashMap.remove(ip))

// Ports src/api/routes/auth.ts. The module-level rate-limit Map becomes a Ref
// created when the group layer is built.
export const authHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'auth',
  (handlers) =>
    Effect.gen(function* () {
      const rateLimitRef = yield* Ref.make<RateLimitBuckets>(HashMap.empty())

      return handlers
        .handle('getStatus', () =>
          withHandlerSpan('getStatus',
            Effect.gen(function* () {
              const db = yield* Database
              const config = yield* loadAuthConfig(db)
              const enabled = config.passwordHash !== null

              if (!enabled) {
                return { authenticated: true, enabled: false }
              }

              const request = yield* HttpServerRequest.HttpServerRequest
              const cookie = request.cookies[sessionCookieName]

              if (!cookie) {
                return { authenticated: false, enabled: true }
              }

              const [session] = yield* internalTryPromise(() =>
                db
                  .select()
                  .from(schema.sessions)
                  .where(eq(schema.sessions.id, cookie))
                  .limit(1)
              )

              const authenticated =
                session !== undefined && session.expiresAt > Date.now()

              return { authenticated, enabled: true }
            })
          )
        )
        .handle('login', ({ payload }) =>
          withHandlerSpan('login',
            Effect.gen(function* () {
              const db = yield* Database
              const request = yield* HttpServerRequest.HttpServerRequest
              const ip = clientIp(request.headers)
              const limit = yield* checkRateLimit(rateLimitRef, ip)

              if (!limit.allowed) {
                const minutes = Math.ceil(limit.retryAfterSeconds / 60)

                yield* HttpApp.appendPreResponseHandler(
                  (_request, response) =>
                    Effect.succeed(
                      HttpServerResponse.setHeader(
                        response,
                        'Retry-After',
                        String(limit.retryAfterSeconds)
                      )
                    )
                )

                return yield* Effect.fail(
                  new TooManyRequests({
                    message: `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
                  })
                )
              }

              const password =
                typeof payload.password === 'string' ? payload.password : ''

              if (password.length === 0) {
                return yield* Effect.fail(
                  new Unauthorized({ message: 'Incorrect password.' })
                )
              }

              const config = yield* loadAuthConfig(db)

              if (config.passwordHash === null) {
                return yield* Effect.fail(
                  new BadRequest({
                    message: 'Password login is disabled on this server.'
                  })
                )
              }

              const valid = yield* internalTryPromise(() =>
                verifyPassword(password, config.passwordHash ?? '')
              )

              if (!valid) {
                yield* recordFailedAttempt(rateLimitRef, ip)

                return yield* Effect.fail(
                  new Unauthorized({ message: 'Incorrect password.' })
                )
              }

              yield* clearAttempts(rateLimitRef, ip)

              const userAgent = request.headers['user-agent'] ?? null
              const token = yield* createSession(db, userAgent)

              yield* setSessionCookie(token)
            })
          )
        )
        .handle('logout', () =>
          withHandlerSpan('logout',
            Effect.gen(function* () {
              const db = yield* Database
              const request = yield* HttpServerRequest.HttpServerRequest
              const token = request.cookies[sessionCookieName]

              if (token) {
                yield* internalTryPromise(() =>
                  db
                    .delete(schema.sessions)
                    .where(eq(schema.sessions.id, token))
                )
              }

              yield* clearSessionCookie
            })
          )
        )
        .handle('changePassword', ({ payload }) =>
          withHandlerSpan('changePassword',
            Effect.gen(function* () {
              const db = yield* Database
              const newPassword =
                typeof payload.newPassword === 'string'
                  ? payload.newPassword
                  : ''
              const currentPassword =
                typeof payload.currentPassword === 'string'
                  ? payload.currentPassword
                  : ''

              const config = yield* loadAuthConfig(db)
              const isEnabled = config.passwordHash !== null

              if (isEnabled) {
                const valid = yield* internalTryPromise(() =>
                  verifyPassword(currentPassword, config.passwordHash ?? '')
                )

                if (!valid) {
                  return yield* Effect.fail(
                    new Unauthorized({
                      message: 'Current password is incorrect.'
                    })
                  )
                }
              }

              if (newPassword.length === 0) {
                yield* internalTryPromise(async () => {
                  await db
                    .update(schema.authConfig)
                    .set({ passwordHash: null, updatedAt: Date.now() })
                    .where(eq(schema.authConfig.id, 1))

                  await db.delete(schema.sessions)
                })

                yield* clearSessionCookie

                return { enabled: false }
              }

              if (newPassword.length < minimumPasswordLength) {
                return yield* Effect.fail(
                  new BadRequest({
                    message: `Choose a password of at least ${minimumPasswordLength} characters.`
                  })
                )
              }

              const hash = yield* internalTryPromise(() =>
                hashPassword(newPassword)
              )

              yield* internalTryPromise(async () => {
                await db
                  .update(schema.authConfig)
                  .set({ passwordHash: hash, updatedAt: Date.now() })
                  .where(eq(schema.authConfig.id, 1))

                await db.delete(schema.sessions)
              })

              const request = yield* HttpServerRequest.HttpServerRequest
              const userAgent = request.headers['user-agent'] ?? null
              const token = yield* createSession(db, userAgent)

              yield* setSessionCookie(token)

              return { enabled: true }
            })
          )
        )
    })
)
