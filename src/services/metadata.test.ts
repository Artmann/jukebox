// @vitest-environment node
import { HttpClient, HttpClientResponse } from '@effect/platform'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Metadata } from './metadata'

// A stub HttpClient layer that answers every request with the given body and
// status, replacing FetchHttpClient. This keeps the metadata service under
// test without touching the network — the Effect equivalent of the old
// globalThis.fetch mock.
function metadataWith(
  body: unknown,
  options: { status?: number } = {}
): Layer.Layer<HttpClient.HttpClient> {
  const status = options.status ?? 200

  const client = HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), { status })
      )
    )
  )

  return Layer.succeed(HttpClient.HttpClient, client)
}

const run = <A>(
  effect: Effect.Effect<A, never, Metadata>,
  httpClient: Layer.Layer<HttpClient.HttpClient> = metadataWith({ results: [] })
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Metadata.DefaultWithoutDependencies),
      Effect.provide(httpClient)
    )
  )

beforeEach(() => {
  delete process.env.JUKEBOX_METADATA_API_URL
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchMovieMetadata', () => {
  it('returns the first search result mapped into our shape', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchMovieMetadata('The Matrix', 1999)
      }),
      metadataWith({
        results: [
          {
            id: 'abc123',
            title: 'The Matrix',
            year: 1999,
            overview: 'A hacker learns the truth.',
            runtime: 136,
            genres: ['Action', 'Sci-Fi'],
            rating: 8.2,
            posterUrl: 'https://cdn.example/poster.jpg',
            backdropUrl: 'https://cdn.example/backdrop.jpg',
            trailerUrl: 'https://youtube.com/watch?v=abc'
          }
        ]
      })
    )

    expect(result).toEqual({
      externalId: 'abc123',
      title: 'The Matrix',
      year: 1999,
      overview: 'A hacker learns the truth.',
      runtime: 136,
      genres: JSON.stringify(['Action', 'Sci-Fi']),
      rating: 8.2,
      posterUrl: 'https://cdn.example/poster.jpg',
      backdropUrl: 'https://cdn.example/backdrop.jpg',
      trailerUrl: 'https://youtube.com/watch?v=abc'
    })
  })

  it('returns null when the search finds no matches', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchMovieMetadata('Does Not Exist', undefined)
      }),
      metadataWith({ results: [] })
    )

    expect(result).toEqual(null)
  })

  it('returns null on a non-ok HTTP status', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchMovieMetadata('The Matrix', 1999)
      }),
      metadataWith({}, { status: 502 })
    )

    expect(result).toEqual(null)
  })
})

describe('fetchMovieByExternalId', () => {
  it('returns the movie mapped into our shape', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchMovieByExternalId('abc123')
      }),
      metadataWith({
        id: 'abc123',
        title: 'The Matrix',
        year: 1999,
        overview: 'A hacker learns the truth.',
        runtime: 136,
        genres: ['Action'],
        rating: 8.2,
        posterUrl: null,
        backdropUrl: null,
        trailerUrl: 'https://youtube.com/watch?v=abc'
      })
    )

    expect(result?.trailerUrl).toEqual('https://youtube.com/watch?v=abc')
    expect(result?.externalId).toEqual('abc123')
  })

  it('returns null on 404', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchMovieByExternalId('unknown')
      }),
      metadataWith({ error: { message: 'Not found' } }, { status: 404 })
    )

    expect(result).toEqual(null)
  })
})

describe('fetchShowMetadata', () => {
  it('returns the first search result mapped into our shape', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchShowMetadata('Breaking Bad', 2008)
      }),
      metadataWith({
        results: [
          {
            id: 'show-1',
            title: 'Breaking Bad',
            year: 2008,
            overview: 'Chemistry teacher.',
            genres: ['Drama'],
            rating: 9.0,
            posterUrl: null,
            backdropUrl: null,
            trailerUrl: null,
            numberOfSeasons: 5
          }
        ]
      })
    )

    expect(result).toEqual({
      externalId: 'show-1',
      title: 'Breaking Bad',
      year: 2008,
      overview: 'Chemistry teacher.',
      genres: JSON.stringify(['Drama']),
      rating: 9.0,
      posterUrl: null,
      backdropUrl: null,
      numberOfSeasons: 5
    })
  })

  it('returns null on non-ok HTTP status', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchShowMetadata('Breaking Bad', 2008)
      }),
      metadataWith({}, { status: 502 })
    )

    expect(result).toEqual(null)
  })
})

describe('fetchSeasonMetadata', () => {
  it('returns the season with episodes mapped', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchSeasonMetadata('show-1', 1)
      }),
      metadataWith({
        seasonNumber: 1,
        name: 'Season 1',
        overview: 'The beginning.',
        posterUrl: 'https://cdn.example/s1.jpg',
        episodes: [
          {
            episodeNumber: 1,
            title: 'Pilot',
            overview: 'First episode.',
            runtime: 58,
            stillUrl: 'https://cdn.example/s1e1.jpg'
          }
        ]
      })
    )

    expect(result).toEqual({
      seasonNumber: 1,
      name: 'Season 1',
      overview: 'The beginning.',
      posterUrl: 'https://cdn.example/s1.jpg',
      episodes: [
        {
          episodeNumber: 1,
          title: 'Pilot',
          overview: 'First episode.',
          runtime: 58,
          stillUrl: 'https://cdn.example/s1e1.jpg'
        }
      ]
    })
  })

  it('returns null on 404', async () => {
    const result = await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchSeasonMetadata('show-1', 99)
      }),
      metadataWith({ error: { message: 'Not found' } }, { status: 404 })
    )

    expect(result).toEqual(null)
  })
})

describe('base URL', () => {
  it('uses the configured API base URL from the env var', async () => {
    process.env.JUKEBOX_METADATA_API_URL = 'https://custom.example'

    const requestedUrls: string[] = []

    const recordingClient = HttpClient.make((request) => {
      requestedUrls.push(request.url)

      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify({ results: [] }), { status: 200 })
        )
      )
    })

    await run(
      Effect.gen(function* () {
        const metadata = yield* Metadata

        return yield* metadata.fetchMovieMetadata('anything')
      }),
      Layer.succeed(HttpClient.HttpClient, recordingClient)
    )

    expect(requestedUrls[0]).toContain('https://custom.example/movies/search')
  })
})
