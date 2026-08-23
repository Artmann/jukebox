import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchSeekStart } from './seek-start'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSeekStart', () => {
  it('returns the snapped keyframe position from the server', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ startSeconds: 1643.642 }))
    )

    vi.stubGlobal('fetch', fetchMock)

    const startSeconds = await fetchSeekStart('episode-677', 1644)

    expect(startSeconds).toEqual(1643.642)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transcode/episode-677/seek/1644'
    )
  })

  it('rounds the target to milliseconds and clamps it at 0 in the URL', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ startSeconds: 0 }))
    )

    vi.stubGlobal('fetch', fetchMock)

    await fetchSeekStart('movie-1', 90.00004)
    await fetchSeekStart('movie-1', -3)

    expect(fetchMock).toHaveBeenCalledWith('/api/transcode/movie-1/seek/90')
    expect(fetchMock).toHaveBeenCalledWith('/api/transcode/movie-1/seek/0')
  })

  // The fallbacks all mean "start at the requested position anyway": the
  // restarted session still plays from the nearest keyframe, the timeline is
  // just slightly approximate — better than refusing the seek.
  it('falls back to the target when the server answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ error: { message: 'nope' } }, 500))
      )
    )

    const startSeconds = await fetchSeekStart('episode-677', 1644)

    expect(startSeconds).toEqual(1644)
  })

  it('falls back to the target when the request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down')))
    )

    const startSeconds = await fetchSeekStart('episode-677', 1644)

    expect(startSeconds).toEqual(1644)
  })

  it('falls back to the target on an unexpected payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ startSeconds: 'soon' }))
      )
    )

    const startSeconds = await fetchSeekStart('episode-677', 1644)

    expect(startSeconds).toEqual(1644)
  })
})
