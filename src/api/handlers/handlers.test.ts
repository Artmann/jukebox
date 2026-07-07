// @vitest-environment node

// End-to-end wire tests for the Effect HttpApi: requests go through
// HttpApiBuilder.toWebHandler with the real middleware, the decode-error
// remap, and an in-memory database — no socket, no mocks besides the
// database singleton (swapped for the in-memory instance, same pattern as
// the existing Hono route tests).
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { eq } from 'drizzle-orm'
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
const { telemetryTestLayer } = await import('../../telemetry/test-layer')

// The scan services (ScanManager + Scheduler) are built once against the test
// database and provided at the root so the api groups and the raw SSE route
// share the single ScanManager instance. NodeHttpServer.layerContext (not
// HttpServer.layerContext) gives the raw streaming routes a real FileSystem
// instead of the noop one.
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
    Layer.provide(telemetryTestLayer),
    Layer.provide(databaseTestLayer(testDatabase.db))
  )
)

const { db, schema } = testDatabase
const profileCookie = 'jukebox_profile_id=1'

afterAll(async () => {
  await dispose()
})

beforeEach(async () => {
  await db.delete(schema.favorites)
  await db.delete(schema.watchProgress)
  await db.delete(schema.subtitles)
  await db.delete(schema.episodes)
  await db.delete(schema.seasons)
  await db.delete(schema.shows)
  await db.delete(schema.sessions)
  await db.delete(schema.authConfig)
  await db.delete(schema.movies)
  await db.delete(schema.profiles)
  await db.delete(schema.libraries)
  await db.delete(schema.scanJobs)
})

describe('hello group', () => {
  it('serves the root /api route without touching the profile cookie', async () => {
    const response = await handler(new Request('http://localhost/api'))

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({ message: 'Jukebox API' })
    expect(response.headers.get('set-cookie')).toEqual(null)
  })
})

describe('profile middleware', () => {
  it('creates a default profile and sets the cookie on first request', async () => {
    const response = await handler(
      new Request('http://localhost/api/profiles')
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('set-cookie') ?? '').toContain(
      'jukebox_profile_id='
    )
    expect(await response.json()).toEqual([
      {
        createdAt: expect.any(String) as string,
        emoji: '🍿',
        id: expect.any(Number) as number,
        name: 'Default'
      }
    ])
  })

  it('does not set the cookie when a valid one is sent', async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })

    const response = await handler(
      new Request('http://localhost/api/profiles', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('set-cookie')).toEqual(null)
  })
})

describe('favorites group', () => {
  beforeEach(async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })

    await db.insert(schema.movies).values({
      id: 10,
      title: 'Inception',
      filePath: '/movies/inception.mp4',
      fileName: 'inception.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    })
  })

  it('round-trips a movie favorite through POST and GET', async () => {
    const post = await handler(
      new Request('http://localhost/api/favorites', {
        body: JSON.stringify({ movieId: 10 }),
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'POST'
      })
    )

    expect(post.status).toEqual(200)
    expect(await post.json()).toEqual({ success: true })

    const list = await handler(
      new Request('http://localhost/api/favorites', {
        headers: { cookie: profileCookie }
      })
    )

    expect(list.status).toEqual(200)
    expect(await list.json()).toEqual([
      {
        createdAt: expect.any(String) as string,
        movie: {
          backdropUrl: null,
          createdAt: '1970-01-01T00:00:00.000Z',
          extension: null,
          externalId: null,
          fileName: 'inception.mp4',
          filePath: '/movies/inception.mp4',
          fileSize: null,
          genres: null,
          id: 10,
          overview: null,
          posterUrl: null,
          rating: null,
          runtime: null,
          title: 'Inception',
          trailerUrl: null,
          updatedAt: '1970-01-01T00:00:00.000Z',
          year: null
        },
        type: 'movie'
      }
    ])
  })
})

describe('auth group', () => {
  it('reports auth disabled and authenticated when no password is set', async () => {
    const response = await handler(
      new Request('http://localhost/api/auth/status')
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      authenticated: true,
      enabled: false
    })
  })
})

describe('auth middleware', () => {
  it('answers 401 with the exact wire body when a password is set', async () => {
    await db.insert(schema.authConfig).values({
      id: 1,
      passwordHash: 'scrypt$c2FsdA==$aGFzaA==',
      updatedAt: Date.now()
    })

    const response = await handler(new Request('http://localhost/api/profiles'))

    expect(response.status).toEqual(401)
    expect(await response.json()).toEqual({
      error: { message: 'Authentication required.' }
    })
  })

  it('leaves /api/auth/status reachable when a password is set', async () => {
    await db.insert(schema.authConfig).values({
      id: 1,
      passwordHash: 'scrypt$c2FsdA==$aGFzaA==',
      updatedAt: Date.now()
    })

    const response = await handler(
      new Request('http://localhost/api/auth/status')
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      authenticated: false,
      enabled: true
    })
  })
})

describe('auth rate limiting', () => {
  it('answers 429 with Retry-After after five failed logins from one IP', async () => {
    // A stored hash that isn't scrypt-formatted makes verifyPassword answer
    // false without running scrypt, keeping the five attempts fast enough
    // that the Retry-After window stays a full 900 seconds.
    await db.insert(schema.authConfig).values({
      id: 1,
      passwordHash: 'not-a-valid-hash',
      updatedAt: Date.now()
    })

    const attemptLogin = () =>
      handler(
        new Request('http://localhost/api/auth/login', {
          body: JSON.stringify({ password: 'wrong-password' }),
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.7'
          },
          method: 'POST'
        })
      )

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await attemptLogin()

      expect(response.status).toEqual(401)
    }

    const limited = await attemptLogin()

    expect(limited.status).toEqual(429)
    expect(limited.headers.get('retry-after')).toEqual('900')
    expect(await limited.json()).toEqual({
      error: { message: 'Too many attempts. Try again in 15 minutes.' }
    })
  })
})

describe('bespoke validation messages', () => {
  it('answers the hand-written hint when the search q param is missing', async () => {
    const response = await handler(new Request('http://localhost/api/search'))

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: {
        message:
          'Add a `q` query parameter to search. Example: /api/search?q=dune'
      }
    })
  })

  it('answers Invalid profile id for a non-numeric profile id', async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: new Date(0) })

    const response = await handler(
      new Request('http://localhost/api/profiles/abc', {
        body: JSON.stringify({ name: 'Renamed' }),
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'PATCH'
      })
    )

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: { message: 'Invalid profile id' }
    })
  })
})

describe('decode-error remap', () => {
  it('answers 400 with a human-friendly message for a type-mismatched body field', async () => {
    const response = await handler(
      new Request('http://localhost/api/favorites', {
        body: JSON.stringify({ movieId: 'x' }),
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'POST'
      })
    )

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: {
        message:
          '`movieId` is invalid: expected number, received "x". Correct the request and try again.'
      }
    })
  })

  it('answers 400 with Invalid request body. for malformed JSON', async () => {
    const response = await handler(
      new Request('http://localhost/api/favorites', {
        body: 'not json',
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'POST'
      })
    )

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: { message: 'Invalid request body.' }
    })
  })
})

const epoch = new Date(0)
const epochIso = '1970-01-01T00:00:00.000Z'

const movieWire = (id: number, title: string, fileName: string) => ({
  backdropUrl: null,
  createdAt: epochIso,
  extension: null,
  externalId: null,
  fileName,
  filePath: `/movies/${fileName}`,
  fileSize: null,
  genres: null,
  id,
  overview: null,
  posterUrl: null,
  rating: null,
  runtime: null,
  title,
  trailerUrl: null,
  updatedAt: epochIso,
  year: null
})

const showWire = {
  backdropUrl: null,
  createdAt: epochIso,
  externalId: null,
  folderPath: '/shows/first-wave',
  genres: null,
  id: 1,
  overview: null,
  posterUrl: null,
  rating: null,
  title: 'First Wave',
  updatedAt: epochIso,
  year: null
}

const episodeWire = (
  id: number,
  episodeNumber: number,
  title: string
) => ({
  createdAt: epochIso,
  episodeNumber,
  extension: null,
  externalId: null,
  fileName: `s01e0${episodeNumber}.mkv`,
  filePath: `/shows/first-wave/s01e0${episodeNumber}.mkv`,
  fileSize: null,
  id,
  overview: null,
  runtime: null,
  seasonId: 5,
  seasonNumber: 1,
  showId: 1,
  stillUrl: null,
  title,
  updatedAt: epochIso
})

async function seedShowWithTwoEpisodes() {
  await db.insert(schema.shows).values({
    id: 1,
    title: 'First Wave',
    folderPath: '/shows/first-wave',
    createdAt: epoch,
    updatedAt: epoch
  })

  await db.insert(schema.seasons).values({ id: 5, showId: 1, seasonNumber: 1 })

  await db.insert(schema.episodes).values([
    {
      id: 21,
      showId: 1,
      seasonId: 5,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Subject 117',
      filePath: '/shows/first-wave/s01e01.mkv',
      fileName: 's01e01.mkv',
      createdAt: epoch,
      updatedAt: epoch
    },
    {
      id: 22,
      showId: 1,
      seasonId: 5,
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'Crazy Eddie',
      filePath: '/shows/first-wave/s01e02.mkv',
      fileName: 's01e02.mkv',
      createdAt: epoch,
      updatedAt: epoch
    }
  ])
}

describe('library group', () => {
  it('lists movies ordered by title', async () => {
    await db.insert(schema.movies).values([
      {
        id: 2,
        title: 'Zoolander',
        filePath: '/movies/zoolander.mp4',
        fileName: 'zoolander.mp4',
        createdAt: epoch,
        updatedAt: epoch
      },
      {
        id: 1,
        title: 'Arrival',
        filePath: '/movies/arrival.mp4',
        fileName: 'arrival.mp4',
        createdAt: epoch,
        updatedAt: epoch
      }
    ])

    const response = await handler(
      new Request('http://localhost/api/library/movies', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual([
      movieWire(1, 'Arrival', 'arrival.mp4'),
      movieWire(2, 'Zoolander', 'zoolander.mp4')
    ])
  })

  it('answers a movie with its subtitle tracks', async () => {
    await db.insert(schema.movies).values({
      id: 10,
      title: 'Inception',
      filePath: '/movies/inception.mp4',
      fileName: 'inception.mp4',
      createdAt: epoch,
      updatedAt: epoch
    })

    await db.insert(schema.subtitles).values({
      id: 3,
      movieId: 10,
      filePath: '/movies/inception.en.srt',
      language: 'en',
      format: 'srt'
    })

    const response = await handler(
      new Request('http://localhost/api/library/movies/10', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      ...movieWire(10, 'Inception', 'inception.mp4'),
      subtitles: [
        {
          displayLanguage: 'English',
          format: 'srt',
          id: 3,
          isSupported: true,
          language: 'en'
        }
      ]
    })
  })

  it('answers 404 Movie not found for an unknown id', async () => {
    const response = await handler(
      new Request('http://localhost/api/library/movies/999', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: { message: 'Movie not found' }
    })
  })
})

describe('shows group', () => {
  beforeEach(seedShowWithTwoEpisodes)

  it('lists shows with season and episode counts', async () => {
    const response = await handler(
      new Request('http://localhost/api/library/shows', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual([
      { ...showWire, episodeCount: 2, seasonCount: 1 }
    ])
  })

  it('answers a show with nested seasons and episodes', async () => {
    const response = await handler(
      new Request('http://localhost/api/library/shows/1', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      ...showWire,
      seasons: [
        {
          episodeCount: null,
          episodes: [
            episodeWire(21, 1, 'Subject 117'),
            episodeWire(22, 2, 'Crazy Eddie')
          ],
          id: 5,
          name: null,
          overview: null,
          posterUrl: null,
          seasonNumber: 1,
          showId: 1
        }
      ]
    })
  })

  it('answers an episode with its show and subtitles', async () => {
    await db.insert(schema.subtitles).values({
      id: 7,
      episodeId: 21,
      filePath: '/shows/first-wave/s01e01.sv.vtt',
      language: 'sv',
      format: 'vtt'
    })

    const response = await handler(
      new Request('http://localhost/api/library/shows/episodes/21', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      episode: episodeWire(21, 1, 'Subject 117'),
      show: showWire,
      subtitles: [
        {
          displayLanguage: 'Swedish',
          format: 'vtt',
          id: 7,
          isSupported: true,
          language: 'sv'
        }
      ]
    })
  })

  it('answers the next episode in order', async () => {
    const response = await handler(
      new Request(
        'http://localhost/api/library/shows/1/next-episode?afterEpisodeId=21',
        { headers: { cookie: profileCookie } }
      )
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      episode: episodeWire(22, 2, 'Crazy Eddie'),
      show: showWire
    })
  })

  it('answers 404 after the last episode', async () => {
    const response = await handler(
      new Request(
        'http://localhost/api/library/shows/1/next-episode?afterEpisodeId=22',
        { headers: { cookie: profileCookie } }
      )
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: { message: 'No more episodes after this one.' }
    })
  })

  it('answers 404 when the episode belongs to another show', async () => {
    const response = await handler(
      new Request(
        'http://localhost/api/library/shows/2/next-episode?afterEpisodeId=21',
        { headers: { cookie: profileCookie } }
      )
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: {
        message:
          'That episode does not belong to this show. Double-check the showId and afterEpisodeId.'
      }
    })
  })

  it('lists the episodes of one season', async () => {
    const response = await handler(
      new Request('http://localhost/api/library/shows/1/seasons/1', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual([
      episodeWire(21, 1, 'Subject 117'),
      episodeWire(22, 2, 'Crazy Eddie')
    ])
  })
})

describe('progress group', () => {
  beforeEach(async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: epoch })

    await db.insert(schema.movies).values({
      id: 10,
      title: 'Inception',
      filePath: '/movies/inception.mp4',
      fileName: 'inception.mp4',
      createdAt: epoch,
      updatedAt: epoch
    })
  })

  it('round-trips movie progress through PUT and GET, flooring times', async () => {
    const put = await handler(
      new Request('http://localhost/api/progress/10', {
        body: JSON.stringify({ currentTime: 42.7, duration: 100.2 }),
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'PUT'
      })
    )

    expect(put.status).toEqual(200)
    expect(await put.json()).toEqual({ success: true })

    const get = await handler(
      new Request('http://localhost/api/progress/10', {
        headers: { cookie: profileCookie }
      })
    )

    expect(get.status).toEqual(200)
    expect(await get.json()).toEqual({ currentTime: 42, duration: 100 })
  })

  it('answers zero progress for an unwatched movie', async () => {
    const response = await handler(
      new Request('http://localhost/api/progress/10', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({ currentTime: 0, duration: null })
  })

  it('lists an in-progress movie under continue watching', async () => {
    await db.insert(schema.watchProgress).values({
      profileId: 1,
      movieId: 10,
      currentTime: 42,
      duration: 100,
      updatedAt: epoch
    })

    const response = await handler(
      new Request('http://localhost/api/progress/continue-watching', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual([
      {
        currentTime: 42,
        duration: 100,
        movie: movieWire(10, 'Inception', 'inception.mp4'),
        type: 'movie',
        updatedAt: epochIso
      }
    ])
  })
})

describe('episode progress group', () => {
  beforeEach(async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: epoch })

    await seedShowWithTwoEpisodes()
  })

  it('round-trips episode progress and maps it by episode id', async () => {
    const put = await handler(
      new Request('http://localhost/api/progress/episode/21', {
        body: JSON.stringify({ currentTime: 30.9, duration: 60.4 }),
        headers: {
          'content-type': 'application/json',
          cookie: profileCookie
        },
        method: 'PUT'
      })
    )

    expect(put.status).toEqual(200)
    expect(await put.json()).toEqual({ success: true })

    const get = await handler(
      new Request('http://localhost/api/progress/episode/21', {
        headers: { cookie: profileCookie }
      })
    )

    expect(get.status).toEqual(200)
    expect(await get.json()).toEqual({ currentTime: 30, duration: 60 })

    const showMap = await handler(
      new Request('http://localhost/api/progress/episode/show/1', {
        headers: { cookie: profileCookie }
      })
    )

    expect(showMap.status).toEqual(200)
    expect(await showMap.json()).toEqual({
      '21': {
        currentTime: 30,
        duration: 60,
        updatedAt: expect.any(String) as string
      }
    })
  })

  it('answers an empty map for a show without episodes', async () => {
    const response = await handler(
      new Request('http://localhost/api/progress/episode/show/999', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({})
  })
})

describe('up next group', () => {
  beforeEach(async () => {
    await db
      .insert(schema.profiles)
      .values({ id: 1, name: 'Default', emoji: '🍿', createdAt: epoch })

    await seedShowWithTwoEpisodes()
  })

  it('answers the next unwatched episode once the latest one is watched', async () => {
    await db.insert(schema.watchProgress).values({
      profileId: 1,
      episodeId: 21,
      currentTime: 95,
      duration: 100,
      updatedAt: epoch
    })

    const response = await handler(
      new Request('http://localhost/api/library/up-next', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual([
      {
        episode: episodeWire(22, 2, 'Crazy Eddie'),
        lastWatchedAt: epochIso,
        show: showWire
      }
    ])
  })

  it('omits shows whose latest episode is still mid-watch', async () => {
    await db.insert(schema.watchProgress).values({
      profileId: 1,
      episodeId: 21,
      currentTime: 10,
      duration: 100,
      updatedAt: epoch
    })

    const response = await handler(
      new Request('http://localhost/api/library/up-next', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual([])
  })
})

describe('scan group', () => {
  it('lists libraries as the four-field projection', async () => {
    await db.insert(schema.libraries).values({
      id: 4,
      name: 'Movies',
      path: '/mnt/movies',
      type: 'movies',
      createdAt: epoch
    })

    const response = await handler(
      new Request('http://localhost/api/scan/libraries', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual([
      { id: 4, name: 'Movies', path: '/mnt/movies', type: 'movies' }
    ])
  })

  it('answers an idle status when no scan has run', async () => {
    const response = await handler(
      new Request('http://localhost/api/scan/status', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      currentJob: null,
      isRunning: false,
      lastJob: null
    })
  })

  it('answers 400 when starting a scan with no libraries configured', async () => {
    const response = await handler(
      new Request('http://localhost/api/scan/start', {
        headers: { cookie: profileCookie },
        method: 'POST'
      })
    )

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: {
        message:
          'No libraries configured. Add a library in Settings before scanning.'
      }
    })
  })
})

describe('scan stream', () => {
  it('opens an SSE stream and sends the ready frame first', async () => {
    const response = await handler(
      new Request('http://localhost/api/scan/stream', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('content-type')).toEqual('text/event-stream')

    const body = response.body

    if (body === null) {
      throw new Error('Expected the SSE response to have a streaming body.')
    }

    const reader = body.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)

    expect(text).toContain('event: ready')
    expect(text).toContain('data: {"at":"')

    await reader.cancel()
  })

  it('answers 401 with the wire body when a password is set', async () => {
    await db.insert(schema.authConfig).values({
      id: 1,
      passwordHash: 'scrypt$c2FsdA==$aGFzaA==',
      updatedAt: Date.now()
    })

    const response = await handler(
      new Request('http://localhost/api/scan/stream')
    )

    expect(response.status).toEqual(401)
    expect(await response.json()).toEqual({
      error: { message: 'Authentication required.' }
    })
  })
})

describe('video stream', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jukebox-stream-'))

    await writeFile(join(tempDir, 'movie.mp4'), '0123456789')

    await db.insert(schema.movies).values({
      id: 10,
      title: 'Inception',
      filePath: join(tempDir, 'movie.mp4'),
      fileName: 'movie.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    })
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  it('streams the whole file with Accept-Ranges and Content-Length', async () => {
    const response = await handler(
      new Request('http://localhost/api/stream/10', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('accept-ranges')).toEqual('bytes')
    expect(response.headers.get('content-length')).toEqual('10')
    expect(response.headers.get('content-type')).toEqual('video/mp4')
    expect(await response.text()).toEqual('0123456789')
  })

  it('answers 206 with the requested byte range', async () => {
    const response = await handler(
      new Request('http://localhost/api/stream/10', {
        headers: { cookie: profileCookie, range: 'bytes=2-5' }
      })
    )

    expect(response.status).toEqual(206)
    expect(response.headers.get('content-range')).toEqual('bytes 2-5/10')
    expect(response.headers.get('content-length')).toEqual('4')
    expect(await response.text()).toEqual('2345')
  })

  it('answers an open-ended range to the end of the file', async () => {
    const response = await handler(
      new Request('http://localhost/api/stream/10', {
        headers: { cookie: profileCookie, range: 'bytes=7-' }
      })
    )

    expect(response.status).toEqual(206)
    expect(response.headers.get('content-range')).toEqual('bytes 7-9/10')
    expect(await response.text()).toEqual('789')
  })

  it('answers 404 Movie not found for an unknown id', async () => {
    const response = await handler(
      new Request('http://localhost/api/stream/999', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: { message: 'Movie not found' }
    })
  })

  it('answers 404 Video file not found when the file is gone', async () => {
    await rm(join(tempDir, 'movie.mp4'))

    const response = await handler(
      new Request('http://localhost/api/stream/10', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: { message: 'Video file not found' }
    })
  })

  it('streams an episode file through the episode route', async () => {
    await seedShowWithTwoEpisodes()
    await writeFile(join(tempDir, 'episode.mkv'), 'abcdef')
    await db
      .update(schema.episodes)
      .set({ filePath: join(tempDir, 'episode.mkv') })
      .where(eq(schema.episodes.id, 21))

    const response = await handler(
      new Request('http://localhost/api/stream/episode/21', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('content-type')).toEqual('video/x-matroska')
    expect(await response.text()).toEqual('abcdef')
  })
})

describe('transcode stream', () => {
  it('answers 404 File not found for an unknown file id', async () => {
    const response = await handler(
      new Request('http://localhost/api/transcode/movie-999/index.m3u8', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: { message: 'File not found' }
    })
  })

  it('answers 404 when requesting a segment without a session', async () => {
    const response = await handler(
      new Request('http://localhost/api/transcode/movie-1/segment-000.ts', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: { message: 'Transcode session not found' }
    })
  })
})

describe('subtitle stream', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jukebox-subs-'))

    await db.insert(schema.libraries).values({
      id: 4,
      name: 'Movies',
      path: tempDir,
      type: 'movies',
      createdAt: new Date(0)
    })

    await db.insert(schema.movies).values({
      id: 10,
      title: 'Inception',
      filePath: join(tempDir, 'movie.mp4'),
      fileName: 'movie.mp4',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    })
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  it('serves a .vtt file as-is with caching headers', async () => {
    await writeFile(join(tempDir, 'movie.en.vtt'), 'WEBVTT\n\nHello')

    await db.insert(schema.subtitles).values({
      id: 3,
      movieId: 10,
      filePath: join(tempDir, 'movie.en.vtt'),
      language: 'en',
      format: 'vtt'
    })

    const response = await handler(
      new Request('http://localhost/api/subtitles/3', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)
    expect(response.headers.get('content-type')).toEqual(
      'text/vtt; charset=utf-8'
    )
    expect(response.headers.get('cache-control')).toEqual(
      'public, max-age=3600'
    )
    expect(await response.text()).toEqual('WEBVTT\n\nHello')
  })

  it('converts a .srt file to WebVTT on the fly', async () => {
    await writeFile(
      join(tempDir, 'movie.en.srt'),
      '1\n00:00:01,000 --> 00:00:02,000\nHello\n'
    )

    await db.insert(schema.subtitles).values({
      id: 3,
      movieId: 10,
      filePath: join(tempDir, 'movie.en.srt'),
      language: 'en',
      format: 'srt'
    })

    const response = await handler(
      new Request('http://localhost/api/subtitles/3', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(200)

    const text = await response.text()

    expect(text).toContain('WEBVTT')
    expect(text).toContain('00:00:01.000 --> 00:00:02.000')
    expect(text).toContain('Hello')
  })

  it('answers 404 for a subtitle stored outside every library', async () => {
    await db.insert(schema.subtitles).values({
      id: 3,
      movieId: 10,
      filePath: join(tmpdir(), 'elsewhere', 'movie.en.vtt'),
      language: 'en',
      format: 'vtt'
    })

    const response = await handler(
      new Request('http://localhost/api/subtitles/3', {
        headers: { cookie: profileCookie }
      })
    )

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: {
        message:
          'Subtitle is outside the configured library paths. Rescan your libraries.'
      }
    })
  })
})
