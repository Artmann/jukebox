// @vitest-environment node

// Wire tests for the filesystem group, ported from the Hono route tests in
// src/api/routes/filesystem.test.ts.
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path, { join } from 'path'

import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { Layer } from 'effect'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDatabase = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDatabase.db,
  schema: testDatabase.schema
}))

const { databaseTestLayer } = await import('../../database/layer')
const { apiLive, decodeErrorRemapLive, rawRoutesLive, scanServicesLive } =
  await import('../../http/app')

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

function browse(browsePath?: string) {
  const query =
    browsePath === undefined
      ? ''
      : `?path=${encodeURIComponent(browsePath)}`

  return handler(
    new Request(`http://localhost/api/filesystem/browse${query}`, {
      headers: { cookie: profileCookie }
    })
  )
}

let workDir: string

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'jukebox-fs-'))

  await db.delete(schema.profiles)
  await db
    .insert(schema.profiles)
    .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })
})

afterEach(async () => {
  await rm(workDir, { force: true, recursive: true })
})

describe('GET /browse', () => {
  it('returns roots when no path is provided', async () => {
    const response = await browse()
    const body = (await response.json()) as {
      entries: Array<{ name: string; path: string }>
      parent: string | null
      path: string
      separator: string
    }

    expect(response.status).toEqual(200)
    expect(body.parent).toEqual(null)
    expect(body.path).toEqual('')
    expect(body.separator).toEqual(path.sep)
    expect(Array.isArray(body.entries)).toEqual(true)
    expect(body.entries.length).toBeGreaterThan(0)
  })

  it('lists subdirectories and skips files and hidden entries', async () => {
    await mkdir(join(workDir, 'alpha'))
    await mkdir(join(workDir, 'Bravo'))
    await mkdir(join(workDir, '.hidden'))
    await writeFile(join(workDir, 'notes.txt'), 'hi')

    const response = await browse(workDir)
    const body = (await response.json()) as {
      entries: Array<{ name: string; path: string }>
      parent: string | null
      path: string
    }

    expect(response.status).toEqual(200)
    expect(body.path).toEqual(path.resolve(workDir))
    expect(body.parent).toEqual(path.dirname(path.resolve(workDir)))
    expect(body.entries).toEqual([
      { name: 'alpha', path: path.join(path.resolve(workDir), 'alpha') },
      { name: 'Bravo', path: path.join(path.resolve(workDir), 'Bravo') }
    ])
  })

  it('returns 404 for a missing folder', async () => {
    const missing = join(workDir, 'does-not-exist')
    const response = await browse(missing)
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(404)
    expect(body.error.message).toContain("doesn't exist")
    expect(body.error.message).toContain(missing)
  })

  it('returns 400 when pointed at a file instead of a folder', async () => {
    const filePath = join(workDir, 'notes.txt')

    await writeFile(filePath, 'hi')

    const response = await browse(filePath)
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain('is a file, not a folder')
  })

  it('resolves .. segments to the parent directory', async () => {
    const child = join(workDir, 'child')

    await mkdir(child)

    const traversed = join(child, '..')
    const response = await browse(traversed)
    const body = (await response.json()) as { path: string }

    expect(response.status).toEqual(200)
    expect(body.path).toEqual(path.resolve(workDir))
  })
})
