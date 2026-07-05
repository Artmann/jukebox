// @vitest-environment node

// Wire tests for the auth group, ported from the Hono route tests in
// src/api/routes/auth.test.ts. The Hono tests probed a bespoke /api/protected
// route; here /api/profiles plays that role — it sits behind the auth
// middleware like every other API group. The rate-limit case is covered by
// handlers.test.ts ('auth rate limiting') and is not repeated here.
import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { Layer } from 'effect'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDatabase.db,
  schema: testDatabase.schema
}))

const { databaseTestLayer } = await import('../../database/layer')
const { apiLive, decodeErrorRemapLive, rawRoutesLive, scanServicesLive } =
  await import('../../http/app')
const { sessionCookieName } = await import('./auth')

const { dispose, handler } = HttpApiBuilder.toWebHandler(
  Layer.mergeAll(
    apiLive,
    rawRoutesLive,
    decodeErrorRemapLive,
    NodeHttpServer.layerContext
  ).pipe(
    Layer.provide(
      scanServicesLive.pipe(Layer.provide(databaseTestLayer(testDatabase.db)))
    ),
    Layer.provide(databaseTestLayer(testDatabase.db))
  )
)

const { db, schema } = testDatabase
const profileCookie = 'jukebox_profile_id=1'

function extractSessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie') ?? ''
  const match = cookie.match(/jukebox_session=([^;,]+)/)

  return decodeURIComponent(match?.[1] ?? '')
}

function requestProtected(extraCookie?: string) {
  const cookie = extraCookie
    ? `${profileCookie}; ${extraCookie}`
    : profileCookie

  return handler(
    new Request('http://localhost/api/profiles', { headers: { cookie } })
  )
}

function postJson(path: string, payload: unknown, extraCookie?: string) {
  const cookie = extraCookie
    ? `${profileCookie}; ${extraCookie}`
    : profileCookie

  return handler(
    new Request(`http://localhost/api${path}`, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', cookie },
      method: 'POST'
    })
  )
}

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  await db.delete(schema.sessions)
  await db.delete(schema.authConfig)
  await db.delete(schema.profiles)

  await db
    .insert(schema.profiles)
    .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })
})

describe('auth routes', () => {
  it('allows protected routes when auth is disabled', async () => {
    const response = await requestProtected()

    expect(response.status).toEqual(200)
  })

  it('enables auth via password change and issues a session cookie', async () => {
    const response = await postJson('/auth/password', {
      newPassword: 'letmein1'
    })
    const body = (await response.json()) as { enabled: boolean }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ enabled: true })
    expect(response.headers.get('set-cookie')).toContain(sessionCookieName)
  })

  it('rejects a new password shorter than 8 characters', async () => {
    const response = await postJson('/auth/password', {
      newPassword: 'short'
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body).toEqual({
      error: { message: 'Choose a password of at least 8 characters.' }
    })
  })

  it('blocks protected routes with 401 when auth is enabled and unauthenticated', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })

    const response = await requestProtected()

    expect(response.status).toEqual(401)
  })

  it('logs in with the correct password and sets a cookie', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })

    const loginResponse = await postJson('/auth/login', {
      password: 'letmein1'
    })

    expect(loginResponse.status).toEqual(204)
    expect(loginResponse.headers.get('set-cookie')).toContain(
      sessionCookieName
    )
  })

  it('rejects the wrong password with 401', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })

    const response = await postJson('/auth/login', {
      password: 'wrong-password'
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(401)
    expect(body).toEqual({ error: { message: 'Incorrect password.' } })
  })

  it('allows authenticated requests to pass the middleware', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })

    const loginResponse = await postJson('/auth/login', {
      password: 'letmein1'
    })
    const cookie = extractSessionCookie(loginResponse)

    const response = await requestProtected(`${sessionCookieName}=${cookie}`)

    expect(response.status).toEqual(200)
  })

  it('changes the password, invalidates sessions, and requires re-login', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })

    const initialLogin = await postJson('/auth/login', {
      password: 'letmein1'
    })
    const initialCookie = extractSessionCookie(initialLogin)

    const changeResponse = await postJson(
      '/auth/password',
      { currentPassword: 'letmein1', newPassword: 'newpassword2' },
      `${sessionCookieName}=${initialCookie}`
    )

    expect(changeResponse.status).toEqual(200)

    const stale = await requestProtected(
      `${sessionCookieName}=${initialCookie}`
    )

    expect(stale.status).toEqual(401)
  })

  it('rejects password change with a wrong current password', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })

    const response = await postJson('/auth/password', {
      currentPassword: 'wrong',
      newPassword: 'newpassword2'
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(401)
    expect(body).toEqual({
      error: { message: 'Current password is incorrect.' }
    })
  })

  it('disables auth when newPassword is empty and clears sessions', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })
    await postJson('/auth/login', { password: 'letmein1' })

    const disableResponse = await postJson('/auth/password', {
      currentPassword: 'letmein1',
      newPassword: ''
    })
    const body = (await disableResponse.json()) as { enabled: boolean }

    expect(disableResponse.status).toEqual(200)
    expect(body).toEqual({ enabled: false })

    const sessions = await db.select().from(schema.sessions)

    expect(sessions).toEqual([])

    const status = await handler(
      new Request('http://localhost/api/auth/status', {
        headers: { cookie: profileCookie }
      })
    )
    const statusBody = (await status.json()) as {
      authenticated: boolean
      enabled: boolean
    }

    expect(statusBody).toEqual({ enabled: false, authenticated: true })
  })

  it('logs out by clearing the cookie and deleting the session', async () => {
    await postJson('/auth/password', { newPassword: 'letmein1' })

    const loginResponse = await postJson('/auth/login', {
      password: 'letmein1'
    })
    const cookie = extractSessionCookie(loginResponse)

    const logoutResponse = await handler(
      new Request('http://localhost/api/auth/logout', {
        headers: {
          cookie: `${profileCookie}; ${sessionCookieName}=${cookie}`
        },
        method: 'POST'
      })
    )

    expect(logoutResponse.status).toEqual(204)

    const sessions = await db.select().from(schema.sessions)
    const remainingIds = sessions.map((session) => session.id)

    expect(remainingIds).not.toContain(cookie)
  })
})
