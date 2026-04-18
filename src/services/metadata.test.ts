// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchMovieByExternalId,
  fetchMovieMetadata,
  fetchSeasonMetadata,
  fetchShowMetadata
} from './metadata'

const originalFetch = globalThis.fetch

function mockFetchResponse(
  body: unknown,
  options: { ok?: boolean; status?: number } = {}
) {
  const response = {
    ok: options.ok ?? true,
    status: options.status ?? (options.ok === false ? 500 : 200),
    statusText: options.ok === false ? 'Error' : 'OK',
    json: () => Promise.resolve(body)
  }

  globalThis.fetch = vi.fn(() => Promise.resolve(response)) as unknown as typeof fetch
}

function mockFetchRejection(error: Error) {
  globalThis.fetch = vi.fn(() => Promise.reject(error)) as unknown as typeof fetch
}

beforeEach(() => {
  delete process.env.JUKEBOX_METADATA_API_URL
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('fetchMovieMetadata', () => {
  it('returns the first search result mapped into our shape', async () => {
    mockFetchResponse({
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

    const result = await fetchMovieMetadata('The Matrix', 1999)

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
    mockFetchResponse({ results: [] })

    const result = await fetchMovieMetadata('Does Not Exist', undefined)

    expect(result).toEqual(null)
  })

  it('returns null when the network request rejects', async () => {
    mockFetchRejection(new Error('getaddrinfo ENOTFOUND'))

    const result = await fetchMovieMetadata('The Matrix', 1999)

    expect(result).toEqual(null)
  })

  it('returns null on a non-ok HTTP status', async () => {
    mockFetchResponse({}, { ok: false, status: 502 })

    const result = await fetchMovieMetadata('The Matrix', 1999)

    expect(result).toEqual(null)
  })

  it('uses the configured API base URL from the env var', async () => {
    process.env.JUKEBOX_METADATA_API_URL = 'https://custom.example'

    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ results: [] })
    })) as unknown as typeof fetch

    globalThis.fetch = fetchMock

    await fetchMovieMetadata('anything')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://custom.example/movies/search')
    )
  })
})

describe('fetchMovieByExternalId', () => {
  it('returns the movie mapped into our shape', async () => {
    mockFetchResponse({
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

    const result = await fetchMovieByExternalId('abc123')

    expect(result?.trailerUrl).toEqual('https://youtube.com/watch?v=abc')
    expect(result?.externalId).toEqual('abc123')
  })

  it('returns null on 404', async () => {
    mockFetchResponse(
      { error: { message: 'Not found' } },
      { ok: false, status: 404 }
    )

    const result = await fetchMovieByExternalId('unknown')

    expect(result).toEqual(null)
  })

  it('returns null when the network request rejects', async () => {
    mockFetchRejection(new Error('socket hang up'))

    const result = await fetchMovieByExternalId('abc')

    expect(result).toEqual(null)
  })
})

describe('fetchShowMetadata', () => {
  it('returns the first search result mapped into our shape', async () => {
    mockFetchResponse({
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

    const result = await fetchShowMetadata('Breaking Bad', 2008)

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

  it('returns null on network failure', async () => {
    mockFetchRejection(new Error('ETIMEDOUT'))

    const result = await fetchShowMetadata('Breaking Bad', 2008)

    expect(result).toEqual(null)
  })

  it('returns null on non-ok HTTP status', async () => {
    mockFetchResponse({}, { ok: false, status: 502 })

    const result = await fetchShowMetadata('Breaking Bad', 2008)

    expect(result).toEqual(null)
  })
})

describe('fetchSeasonMetadata', () => {
  it('returns the season with episodes mapped', async () => {
    mockFetchResponse({
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

    const result = await fetchSeasonMetadata('show-1', 1)

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
    mockFetchResponse(
      { error: { message: 'Not found' } },
      { ok: false, status: 404 }
    )

    const result = await fetchSeasonMetadata('show-1', 99)

    expect(result).toEqual(null)
  })

  it('returns null on network failure', async () => {
    mockFetchRejection(new Error('ECONNRESET'))

    const result = await fetchSeasonMetadata('show-1', 1)

    expect(result).toEqual(null)
  })
})
