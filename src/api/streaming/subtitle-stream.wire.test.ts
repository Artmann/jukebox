// @vitest-environment node

// Wire tests for the raw subtitle route, ported from the Hono route tests in
// src/api/routes/subtitles.test.ts. The vtt-as-is, srt-conversion, and
// outside-library cases are covered by handlers.test.ts ('subtitle stream')
// and are not repeated here.
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

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

function getSubtitle(id: number | string) {
  return handler(
    new Request(`http://localhost/api/subtitles/${id}`, {
      headers: { cookie: profileCookie }
    })
  )
}

let workingDirectory: string

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  workingDirectory = await mkdtemp(join(tmpdir(), 'jukebox-sub-routes-'))

  await db.delete(schema.subtitles)
  await db.delete(schema.movies)
  await db.delete(schema.libraries)
  await db.delete(schema.profiles)

  await db
    .insert(schema.profiles)
    .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })

  await db.insert(schema.libraries).values({
    name: 'Test Library',
    path: workingDirectory,
    type: 'movies',
    createdAt: new Date(0)
  })

  await db.insert(schema.movies).values({
    id: 100,
    title: 'Test Movie',
    filePath: join(workingDirectory, 'movie.mkv'),
    fileName: 'movie.mkv',
    createdAt: new Date(0),
    updatedAt: new Date(0)
  })
})

afterEach(async () => {
  await rm(workingDirectory, { recursive: true, force: true })
})

describe('GET /api/subtitles/:id', () => {
  it('returns 400 for a non-numeric id', async () => {
    const response = await getSubtitle('abc')

    expect(response.status).toEqual(400)
  })

  it('returns 404 when the subtitle id does not exist', async () => {
    const response = await getSubtitle(9999)

    expect(response.status).toEqual(404)
  })

  it('returns 415 with an actionable message for .ass subtitles', async () => {
    const filePath = join(workingDirectory, 'movie.ja.ass')

    await writeFile(filePath, '[Script Info]\n', 'utf-8')

    const inserted = await db
      .insert(schema.subtitles)
      .values({
        movieId: 100,
        filePath,
        format: 'ass',
        language: 'ja'
      })
      .returning({ id: schema.subtitles.id })

    const id = inserted[0]?.id ?? 0
    const response = await getSubtitle(id)

    expect(response.status).toEqual(415)
    expect(await response.text()).toContain('Convert the file to .srt or .vtt')
  })

  it('returns 500 with the documented error text when the file is missing', async () => {
    const inserted = await db
      .insert(schema.subtitles)
      .values({
        movieId: 100,
        filePath: join(workingDirectory, 'does-not-exist.srt'),
        format: 'srt',
        language: 'en'
      })
      .returning({ id: schema.subtitles.id })

    const id = inserted[0]?.id ?? 0
    const response = await getSubtitle(id)

    expect(response.status).toEqual(500)
    expect(await response.text()).toEqual(
      "Couldn't convert subtitle file. Check it's a valid SRT."
    )
  })
})
