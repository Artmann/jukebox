import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const videojsMock = vi.hoisted(() => vi.fn())

vi.mock('video.js', () => ({ default: videojsMock }))
vi.mock('video.js/dist/video-js.css', () => ({}))

const audioTrackState: { canDecode: boolean; hasTrack: boolean } = {
  canDecode: true,
  hasTrack: true
}

const durationState: { shouldReject: boolean; value: number | null } = {
  shouldReject: false,
  value: 3240
}

let lastInputError: Error | null = null

class FakeInput {
  dispose = vi.fn()

  getPrimaryAudioTrack() {
    if (lastInputError) {
      throw lastInputError
    }

    if (!audioTrackState.hasTrack) {
      return null
    }

    return { canDecode: vi.fn(() => audioTrackState.canDecode) }
  }

  getDurationFromMetadata(): Promise<number | null> {
    if (durationState.shouldReject) {
      return Promise.reject(new Error('duration probe failed'))
    }

    return Promise.resolve(durationState.value)
  }
}

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  Input: vi.fn(function () {
    return new FakeInput()
  }),
  UrlSource: vi.fn()
}))

import { pickSource, VideoPlayer } from './VideoPlayer'

function createFakePlayer() {
  return {
    addRemoteTextTrack: vi.fn(() => ({})),
    dispose: vi.fn(),
    duration: vi.fn(() => 0),
    error: vi.fn(() => null),
    isDisposed: vi.fn(() => false),
    on: vi.fn(),
    pause: vi.fn(),
    paused: vi.fn(() => true),
    play: vi.fn(),
    poster: vi.fn(),
    removeRemoteTextTrack: vi.fn(),
    src: vi.fn()
  }
}

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent
  })
}

const chromeUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const safariUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

afterEach(() => {
  audioTrackState.canDecode = true
  audioTrackState.hasTrack = true
  durationState.shouldReject = false
  durationState.value = 3240
  lastInputError = null
  setUserAgent(chromeUserAgent)
})

// Chrome now reports native HLS support (canPlayType('application/vnd.apple.
// mpegurl') === 'maybe'). Setting vhs.overrideNative to false therefore handed
// our transcode playlists to Chrome's native HLS engine, which never refreshes
// the still-growing "live" playlist a running transcode serves: playback
// stalled after the first segments and failed with MEDIA_ERR_SRC_NOT_SUPPORTED.
// Leaving VHS's own default in place keeps MSE playback everywhere except
// Safari/iOS, where native playback is what exposes the AirPlay picker.
describe('player options', () => {
  beforeEach(() => {
    videojsMock.mockImplementation(() => createFakePlayer())
  })

  it('does not opt out of VHS, so HLS plays through MSE', async () => {
    render(<VideoPlayer src="/api/stream/episode/677" />)

    await waitFor(() => {
      expect(videojsMock).toHaveBeenCalled()
    })

    const [, options] = videojsMock.mock.calls[0]

    expect(options).toEqual({
      autoplay: true,
      controls: false,
      fill: true,
      poster: undefined
    })
  })
})

describe('pickSource', () => {
  it('direct-plays a non-mkv source with decodable audio', async () => {
    setUserAgent(chromeUserAgent)

    const source = await pickSource('/api/stream/42')

    expect(source).toEqual({
      src: '/api/stream/42',
      type: 'video/mp4',
      duration: null
    })
  })

  it('direct-plays an mkv source with decodable audio as video/x-matroska', async () => {
    setUserAgent(chromeUserAgent)

    const source = await pickSource('/api/stream/episode/677.mkv')

    expect(source).toEqual({
      src: '/api/stream/episode/677.mkv',
      type: 'video/x-matroska',
      duration: null
    })
  })

  it('routes to HLS transcode when the audio track cannot be decoded', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.canDecode = false

    const source = await pickSource('/api/stream/episode/677')

    expect(source).toEqual({
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl',
      duration: 3240
    })
  })

  it('routes movie sources to their transcode key', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.canDecode = false

    const source = await pickSource('/api/stream/42')

    expect(source).toEqual({
      src: '/api/transcode/movie-42/index.m3u8',
      type: 'application/vnd.apple.mpegurl',
      duration: 3240
    })
  })

  it('does not require a transcode when there is no audio track at all', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.hasTrack = false

    const source = await pickSource('/api/stream/episode/677.mkv')

    expect(source).toEqual({
      src: '/api/stream/episode/677.mkv',
      type: 'video/x-matroska',
      duration: null
    })
  })

  it('fails safe to HLS transcode when probing throws', async () => {
    setUserAgent(chromeUserAgent)
    lastInputError = new Error('probe failed')

    const source = await pickSource('/api/stream/episode/677')

    expect(source).toEqual({
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl',
      duration: null
    })
  })

  it('still routes Safari + mkv to HLS for AirPlay, even with decodable audio', async () => {
    setUserAgent(safariUserAgent)

    const source = await pickSource('/api/stream/episode/677.mkv')

    expect(source).toEqual({
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl',
      duration: 3240
    })
  })

  it('falls back to a null duration when the metadata probe fails', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.canDecode = false
    durationState.shouldReject = true

    const source = await pickSource('/api/stream/episode/677')

    expect(source).toEqual({
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl',
      duration: null
    })
  })
})
