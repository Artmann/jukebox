// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../../database/test-database'

const testDb = createTestDatabase()

vi.mock('../../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

const { subtitleRoutes } = await import('./subtitles')

function buildApp(): Hono {
  const app = new Hono()
  app.route('/', subtitleRoutes)
  return app
}

let workingDirectory: string

beforeEach(async () => {
  workingDirectory = await mkdtemp(join(tmpdir(), 'jukebox-sub-routes-'))

  await testDb.db.delete(testDb.schema.subtitles)
  await testDb.db.delete(testDb.schema.movies)

  await testDb.db.insert(testDb.schema.movies).values({
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
    const app = buildApp()
    const response = await app.request('/abc')

    expect(response.status).toEqual(400)
  })

  it('returns 404 when the subtitle id does not exist', async () => {
    const app = buildApp()
    const response = await app.request('/9999')

    expect(response.status).toEqual(404)
  })

  it('serves a .vtt file as-is with the correct content type', async () => {
    const filePath = join(workingDirectory, 'movie.en.vtt')
    const body = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n'

    await writeFile(filePath, body, 'utf-8')

    const inserted = await testDb.db
      .insert(testDb.schema.subtitles)
      .values({
        movieId: 100,
        filePath,
        format: 'vtt',
        language: 'en'
      })
      .returning({ id: testDb.schema.subtitles.id })

    const id = inserted[0]?.id ?? 0
    const app = buildApp()
    const response = await app.request(`/${id}`)

    expect(response.status).toEqual(200)
    expect(response.headers.get('content-type')).toEqual(
      'text/vtt; charset=utf-8'
    )
    expect(await response.text()).toEqual(body)
  })

  it('converts a .srt file to WebVTT on the fly', async () => {
    const filePath = join(workingDirectory, 'movie.en.srt')
    const srtBody = [
      '1',
      '00:00:01,000 --> 00:00:04,000',
      'Hello, world!',
      ''
    ].join('\n')

    await writeFile(filePath, srtBody, 'utf-8')

    const inserted = await testDb.db
      .insert(testDb.schema.subtitles)
      .values({
        movieId: 100,
        filePath,
        format: 'srt',
        language: 'en'
      })
      .returning({ id: testDb.schema.subtitles.id })

    const id = inserted[0]?.id ?? 0
    const app = buildApp()
    const response = await app.request(`/${id}`)

    expect(response.status).toEqual(200)
    expect(response.headers.get('content-type')).toEqual(
      'text/vtt; charset=utf-8'
    )

    const text = await response.text()

    expect(text.startsWith('WEBVTT')).toEqual(true)
    expect(text).toContain('00:00:01.000 --> 00:00:04.000')
  })

  it('returns 415 with an actionable message for .ass subtitles', async () => {
    const filePath = join(workingDirectory, 'movie.ja.ass')

    await writeFile(filePath, '[Script Info]\n', 'utf-8')

    const inserted = await testDb.db
      .insert(testDb.schema.subtitles)
      .values({
        movieId: 100,
        filePath,
        format: 'ass',
        language: 'ja'
      })
      .returning({ id: testDb.schema.subtitles.id })

    const id = inserted[0]?.id ?? 0
    const app = buildApp()
    const response = await app.request(`/${id}`)

    expect(response.status).toEqual(415)
    expect(await response.text()).toContain('Convert the file to .srt or .vtt')
  })

  it('returns 500 with the documented error text when the file is missing', async () => {
    const inserted = await testDb.db
      .insert(testDb.schema.subtitles)
      .values({
        movieId: 100,
        filePath: join(workingDirectory, 'does-not-exist.srt'),
        format: 'srt',
        language: 'en'
      })
      .returning({ id: testDb.schema.subtitles.id })

    const id = inserted[0]?.id ?? 0
    const app = buildApp()
    const response = await app.request(`/${id}`)

    expect(response.status).toEqual(500)
    expect(await response.text()).toEqual(
      "Couldn't convert subtitle file. Check it's a valid SRT."
    )
  })
})
