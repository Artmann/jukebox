import { afterEach, describe, expect, it, vi } from 'vitest'

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

  async getDurationFromMetadata() {
    if (durationState.shouldReject) {
      throw new Error('duration probe failed')
    }

    return durationState.value
  }
}

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  Input: vi.fn(function () {
    return new FakeInput()
  }),
  UrlSource: vi.fn()
}))

import { pickSource } from './VideoPlayer'

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
