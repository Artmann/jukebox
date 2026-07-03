// @vitest-environment node
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDb = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

const { setupRoutes } = await import('./setup')

interface FieldError {
  index: number
  message: string
}

interface ErrorBody {
  error: { fieldErrors?: FieldError[]; message: string }
}

let moviesDirectory: string
let showsDirectory: string

async function request(path: string, options?: RequestInit) {
  const response = await setupRoutes.request(path, options)
  const body = (await response.json()) as unknown

  return { body, status: response.status }
}

function postComplete(payload: unknown) {
  return request('/complete', {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
}

beforeEach(async () => {
  await testDb.db.delete(testDb.schema.libraries)

  moviesDirectory = await mkdtemp(join(tmpdir(), 'jukebox-setup-movies-'))
  showsDirectory = await mkdtemp(join(tmpdir(), 'jukebox-setup-shows-'))
})

afterEach(async () => {
  await rm(moviesDirectory, { force: true, recursive: true })
  await rm(showsDirectory, { force: true, recursive: true })
})

describe('GET /', () => {
  it('reports needsSetup when no libraries exist', async () => {
    const { body, status } = await request('/')

    expect(status).toEqual(200)
    expect(body).toEqual({ libraries: [], libraryCount: 0, needsSetup: true })
  })

  it('reports setup done when libraries exist', async () => {
    await testDb.db.insert(testDb.schema.libraries).values({
      name: 'Movies',
      path: moviesDirectory,
      type: 'movies',
      createdAt: new Date()
    })

    const { body, status } = await request('/')
    const typed = body as {
      libraries: unknown[]
      libraryCount: number
      needsSetup: boolean
    }

    expect(status).toEqual(200)
    expect(typed.libraryCount).toEqual(1)
    expect(typed.needsSetup).toEqual(false)
  })
})

describe('POST /complete', () => {
  it('rejects an empty library list with an actionable message', async () => {
    const { body, status } = await postComplete({ libraries: [] })

    expect(status).toEqual(400)
    expect(body).toEqual({
      error: { message: 'Add at least one folder before completing setup.' }
    })
  })

  it('rejects an invalid JSON body', async () => {
    const { body, status } = await request('/complete', {
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })

    expect(status).toEqual(400)
    expect(body).toEqual({ error: { message: 'Invalid request body.' } })
  })

  it('rejects a nonexistent path with a per-row field error', async () => {
    const missing = join(moviesDirectory, 'missing')

    const { body, status } = await postComplete({
      libraries: [
        { name: '', path: moviesDirectory, type: 'movies' },
        { name: '', path: missing, type: 'shows' }
      ]
    })

    expect(status).toEqual(400)
    expect(body).toEqual({
      error: {
        fieldErrors: [
          {
            index: 1,
            message: `Library path doesn't exist or isn't readable: ${missing}. Check the path and Jukebox's file permissions.`
          }
        ],
        message: 'Fix the highlighted folders, then try again.'
      }
    })
  })

  it('rejects duplicate paths with a per-row field error', async () => {
    const { body, status } = await postComplete({
      libraries: [
        { name: '', path: moviesDirectory, type: 'movies' },
        { name: '', path: moviesDirectory, type: 'shows' }
      ]
    })

    expect(status).toEqual(400)
    expect((body as ErrorBody).error.fieldErrors).toEqual([
      {
        index: 1,
        message: `You've added ${moviesDirectory} more than once. Remove the duplicate row.`
      }
    ])
  })

  it('rejects a blank path with a per-row field error', async () => {
    const { body, status } = await postComplete({
      libraries: [{ name: '', path: '   ', type: 'movies' }]
    })

    expect(status).toEqual(400)
    expect((body as ErrorBody).error.fieldErrors).toEqual([
      { index: 0, message: 'Enter a folder path or remove this row.' }
    ])
  })

  it('replaces existing libraries and defaults names from the folder', async () => {
    await testDb.db.insert(testDb.schema.libraries).values({
      name: 'First Wave Season 1',
      path: join(tmpdir(), 'stale-old-library'),
      type: 'shows',
      createdAt: new Date()
    })

    const { body, status } = await postComplete({
      libraries: [
        { name: '', path: moviesDirectory, type: 'movies' },
        { name: 'My Shows', path: showsDirectory, type: 'shows' }
      ]
    })

    expect(status).toEqual(200)
    expect(body).toEqual({ success: true })

    const rows = await testDb.db.select().from(testDb.schema.libraries)

    expect(
      rows.map((row) => ({ name: row.name, path: row.path, type: row.type }))
    ).toEqual([
      {
        name: moviesDirectory.split(/[\\/]/).filter(Boolean).pop(),
        path: moviesDirectory,
        type: 'movies'
      },
      { name: 'My Shows', path: showsDirectory, type: 'shows' }
    ])
  })

  it('keeps existing libraries when the request is rejected', async () => {
    await testDb.db.insert(testDb.schema.libraries).values({
      name: 'Existing',
      path: moviesDirectory,
      type: 'movies',
      createdAt: new Date()
    })

    const { status } = await postComplete({
      libraries: [
        { name: '', path: join(moviesDirectory, 'missing'), type: 'movies' }
      ]
    })

    expect(status).toEqual(400)

    const rows = await testDb.db.select().from(testDb.schema.libraries)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toEqual('Existing')
  })
})
