// @vitest-environment node
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDb = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

const { authMiddleware } = await import('../middleware/auth')
const { authRoutes, resetRateLimit, sessionCookieName } = await import('./auth')

function buildApp(): Hono {
  const app = new Hono()

  app.use('/api/*', authMiddleware)
  app.route('/api/auth', authRoutes)

  app.get('/api/protected', (context) =>
    context.json({ ok: true })
  )

  return app
}

function extractSessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie') ?? ''
  const match = cookie.match(/jukebox_session=([^;]+)/)

  return decodeURIComponent(match?.[1] ?? '')
}

async function reset(): Promise<void> {
  await testDb.db.delete(testDb.schema.sessions)
  await testDb.db.delete(testDb.schema.authConfig)
}

beforeEach(async () => {
  await reset()
  resetRateLimit()
})

describe('auth routes', () => {
  it('reports disabled + authenticated on a fresh database', async () => {
    const app = buildApp()
    const response = await app.request('/api/auth/status')
    const body = (await response.json()) as {
      enabled: boolean
      authenticated: boolean
    }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ enabled: false, authenticated: true })
  })

  it('allows protected routes when auth is disabled', async () => {
    const app = buildApp()
    const response = await app.request('/api/protected')

    expect(response.status).toEqual(200)
  })

  it('enables auth via password change and issues a session cookie', async () => {
    const app = buildApp()
    const response = await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })
    const body = (await response.json()) as { enabled: boolean }

    expect(response.status).toEqual(200)
    expect(body).toEqual({ enabled: true })
    expect(response.headers.get('set-cookie')).toContain(sessionCookieName)
  })

  it('rejects a new password shorter than 8 characters', async () => {
    const app = buildApp()
    const response = await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'short' })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body).toEqual({
      error: { message: 'Choose a password of at least 8 characters.' }
    })
  })

  it('blocks protected routes with 401 when auth is enabled and unauthenticated', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })

    const response = await app.request('/api/protected')

    expect(response.status).toEqual(401)
  })

  it('logs in with the correct password and sets a cookie', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'letmein1' })
    })

    expect(loginResponse.status).toEqual(204)
    expect(loginResponse.headers.get('set-cookie')).toContain(sessionCookieName)
  })

  it('rejects the wrong password with 401', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(401)
    expect(body).toEqual({ error: { message: 'Incorrect password.' } })
  })

  it('rate-limits after 5 failed attempts and returns Retry-After', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })

    for (let index = 0; index < 5; index++) {
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'wrong-password' })
      })
    }

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
    expect(body.error.message).toMatch(/Too many attempts/)
  })

  it('allows authenticated requests to pass the middleware', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'letmein1' })
    })
    const cookie = extractSessionCookie(loginResponse)

    const response = await app.request('/api/protected', {
      headers: { cookie: `${sessionCookieName}=${cookie}` }
    })

    expect(response.status).toEqual(200)
  })

  it('changes the password, invalidates sessions, and requires re-login', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })
    const initialLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'letmein1' })
    })
    const initialCookie = extractSessionCookie(initialLogin)

    const changeResponse = await app.request('/api/auth/password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${sessionCookieName}=${initialCookie}`
      },
      body: JSON.stringify({
        currentPassword: 'letmein1',
        newPassword: 'newpassword2'
      })
    })

    expect(changeResponse.status).toEqual(200)

    const stale = await app.request('/api/protected', {
      headers: { cookie: `${sessionCookieName}=${initialCookie}` }
    })

    expect(stale.status).toEqual(401)
  })

  it('rejects password change with a wrong current password', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })

    const response = await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'wrong',
        newPassword: 'newpassword2'
      })
    })
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(401)
    expect(body).toEqual({
      error: { message: 'Current password is incorrect.' }
    })
  })

  it('disables auth when newPassword is empty and clears sessions', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })
    await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'letmein1' })
    })

    const disableResponse = await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'letmein1',
        newPassword: ''
      })
    })
    const body = (await disableResponse.json()) as { enabled: boolean }

    expect(disableResponse.status).toEqual(200)
    expect(body).toEqual({ enabled: false })

    const sessions = await testDb.db.select().from(testDb.schema.sessions)
    expect(sessions).toEqual([])

    const status = await app.request('/api/auth/status')
    const statusBody = (await status.json()) as {
      enabled: boolean
      authenticated: boolean
    }

    expect(statusBody).toEqual({ enabled: false, authenticated: true })
  })

  it('logs out by clearing the cookie and deleting the session', async () => {
    const app = buildApp()

    await app.request('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'letmein1' })
    })
    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'letmein1' })
    })
    const cookie = extractSessionCookie(loginResponse)

    const logoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${sessionCookieName}=${cookie}` }
    })

    expect(logoutResponse.status).toEqual(204)

    const sessions = await testDb.db.select().from(testDb.schema.sessions)
    const remainingIds = sessions.map((session) => session.id)

    expect(remainingIds).not.toContain(cookie)
  })
})
