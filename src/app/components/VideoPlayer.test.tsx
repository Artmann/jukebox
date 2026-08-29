import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const videojsMock = vi.hoisted(() => vi.fn())

vi.mock('video.js', () => ({ default: videojsMock }))
vi.mock('video.js/dist/video-js.css', () => ({}))

const audioTrackState: { codec: string | null; hasTrack: boolean } = {
  codec: 'aac',
  hasTrack: true
}

const durationState: { shouldReject: boolean; value: number | null } = {
  shouldReject: false,
  value: 3240
}

let lastInputError: Error | null = null
let probeCount = 0

class FakeInput {
  dispose = vi.fn()

  constructor() {
    probeCount++
  }

  getPrimaryAudioTrack() {
    if (lastInputError) {
      throw lastInputError
    }

    if (!audioTrackState.hasTrack) {
      return null
    }

    return { getCodec: vi.fn(() => Promise.resolve(audioTrackState.codec)) }
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

import { resolveSource } from '../lib/resolve-source'
import { VideoPlayer } from './VideoPlayer'

type EventHandler = () => void

function createFakePlayer() {
  const handlers = new Map<string, EventHandler[]>()

  const on = vi.fn((event: string, handler: EventHandler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler])
  })

  return {
    addRemoteTextTrack: vi.fn(() => ({})),
    dispose: vi.fn(),
    duration: vi.fn(() => 0),
    emit: (event: string) => {
      for (const handler of handlers.get(event) ?? []) {
        handler()
      }
    },
    error: vi.fn(() => null),
    isDisposed: vi.fn(() => false),
    off: vi.fn(),
    on,
    one: on,
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
  audioTrackState.codec = 'aac'
  audioTrackState.hasTrack = true
  durationState.shouldReject = false
  durationState.value = 3240
  lastInputError = null
  probeCount = 0
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

    const options: unknown = videojsMock.mock.calls[0]?.[1]

    expect(options).toEqual({
      autoplay: true,
      controls: false,
      fill: true,
      poster: undefined
    })
  })
})

// A transcode only ever produces output forward from where it started, so a
// seek past its head restarts the conversion at the seek position. The player
// asks for that by sourcing the `at/<start>` URL, and its own timeline starts
// over at 0 there — which is why the duration override has to shrink with it.
describe('seeking past the transcode head', () => {
  let player: ReturnType<typeof createFakePlayer>

  beforeEach(() => {
    player = createFakePlayer()
    videojsMock.mockImplementation(() => player)
    audioTrackState.codec = 'eac3'
  })

  it('sources the transcode at the requested position', async () => {
    const view = render(
      <VideoPlayer
        src="/api/stream/episode/677"
        startSeconds={0}
      />
    )

    await waitFor(() => {
      expect(player.src).toHaveBeenCalledWith({
        src: '/api/transcode/episode-677/index.m3u8',
        type: 'application/vnd.apple.mpegurl'
      })
    })

    view.rerender(
      <VideoPlayer
        src="/api/stream/episode/677"
        startSeconds={1800}
      />
    )

    await waitFor(() => {
      expect(player.src).toHaveBeenCalledWith({
        src: '/api/transcode/episode-677/at/1800/index.m3u8',
        type: 'application/vnd.apple.mpegurl'
      })
    })
  })

  it('shrinks the duration override to the restarted session', async () => {
    const view = render(
      <VideoPlayer
        src="/api/stream/episode/677"
        startSeconds={1800}
      />
    )

    await waitFor(() => {
      expect(player.src).toHaveBeenCalled()
    })

    player.emit('durationchange')

    expect(player.duration).toHaveBeenCalledWith(3240 - 1800)

    view.rerender(
      <VideoPlayer
        src="/api/stream/episode/677"
        startSeconds={0}
      />
    )

    await waitFor(() => {
      expect(player.src).toHaveBeenCalledTimes(2)
    })

    player.emit('durationchange')

    expect(player.duration).toHaveBeenCalledWith(3240)
  })

  // Probing is a network round-trip against the file itself. Paying for it on
  // every seek would make jumping around the timeline needlessly slow.
  it('does not probe the file again when restarting at a new position', async () => {
    const view = render(
      <VideoPlayer
        src="/api/stream/episode/677"
        startSeconds={0}
      />
    )

    await waitFor(() => {
      expect(player.src).toHaveBeenCalled()
    })

    const probesAfterFirstSource = probeCount

    view.rerender(
      <VideoPlayer
        src="/api/stream/episode/677"
        startSeconds={1800}
      />
    )

    await waitFor(() => {
      expect(player.src).toHaveBeenCalledTimes(2)
    })

    expect(probeCount).toEqual(probesAfterFirstSource)
  })

  it('reports the resolved source once per stream', async () => {
    const onSourceResolved = vi.fn()

    const view = render(
      <VideoPlayer
        onSourceResolved={onSourceResolved}
        src="/api/stream/episode/677"
        startSeconds={0}
      />
    )

    await waitFor(() => {
      expect(onSourceResolved).toHaveBeenCalledWith({
        duration: 3240,
        fileId: 'episode-677',
        isTranscoded: true,
        src: '/api/transcode/episode-677/index.m3u8',
        type: 'application/vnd.apple.mpegurl'
      })
    })

    view.rerender(
      <VideoPlayer
        onSourceResolved={onSourceResolved}
        src="/api/stream/episode/677"
        startSeconds={1800}
      />
    )

    await waitFor(() => {
      expect(player.src).toHaveBeenCalledTimes(2)
    })

    expect(onSourceResolved).toHaveBeenCalledTimes(1)
  })
})

describe('resolveSource', () => {
  it('direct-plays a non-mkv source with decodable audio', async () => {
    setUserAgent(chromeUserAgent)

    const source = await resolveSource('/api/stream/42')

    expect(source).toEqual({
      duration: null,
      fileId: null,
      isTranscoded: false,
      src: '/api/stream/42',
      type: 'video/mp4'
    })
  })

  it('direct-plays an mkv source with decodable audio as video/x-matroska', async () => {
    setUserAgent(chromeUserAgent)

    const source = await resolveSource('/api/stream/episode/677.mkv')

    expect(source).toEqual({
      duration: null,
      fileId: null,
      isTranscoded: false,
      src: '/api/stream/episode/677.mkv',
      type: 'video/x-matroska'
    })
  })

  it('routes to HLS transcode when the audio codec is not direct-playable (eac3)', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.codec = 'eac3'

    const source = await resolveSource('/api/stream/episode/677')

    expect(source).toEqual({
      duration: 3240,
      fileId: 'episode-677',
      isTranscoded: true,
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl'
    })
  })

  it('routes movie sources to their transcode key', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.codec = 'eac3'

    const source = await resolveSource('/api/stream/42')

    expect(source).toEqual({
      duration: 3240,
      fileId: 'movie-42',
      isTranscoded: true,
      src: '/api/transcode/movie-42/index.m3u8',
      type: 'application/vnd.apple.mpegurl'
    })
  })

  it('routes to HLS transcode when the audio codec is unrecognized', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.codec = null

    const source = await resolveSource('/api/stream/episode/677')

    expect(source).toEqual({
      duration: 3240,
      fileId: 'episode-677',
      isTranscoded: true,
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl'
    })
  })

  it('does not require a transcode when there is no audio track at all', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.hasTrack = false

    const source = await resolveSource('/api/stream/episode/677.mkv')

    expect(source).toEqual({
      duration: null,
      fileId: null,
      isTranscoded: false,
      src: '/api/stream/episode/677.mkv',
      type: 'video/x-matroska'
    })
  })

  it('fails safe to HLS transcode when probing throws', async () => {
    setUserAgent(chromeUserAgent)
    lastInputError = new Error('probe failed')

    const source = await resolveSource('/api/stream/episode/677')

    expect(source).toEqual({
      duration: null,
      fileId: 'episode-677',
      isTranscoded: true,
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl'
    })
  })

  it('still routes Safari + mkv to HLS for AirPlay, even with decodable audio', async () => {
    setUserAgent(safariUserAgent)

    const source = await resolveSource('/api/stream/episode/677.mkv')

    expect(source).toEqual({
      duration: 3240,
      fileId: 'episode-677',
      isTranscoded: true,
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl'
    })
  })

  it('falls back to a null duration when the metadata probe fails', async () => {
    setUserAgent(chromeUserAgent)
    audioTrackState.codec = 'eac3'
    durationState.shouldReject = true

    const source = await resolveSource('/api/stream/episode/677')

    expect(source).toEqual({
      duration: null,
      fileId: 'episode-677',
      isTranscoded: true,
      src: '/api/transcode/episode-677/index.m3u8',
      type: 'application/vnd.apple.mpegurl'
    })
  })
})
