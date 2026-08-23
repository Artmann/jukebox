import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type Player from 'video.js/dist/types/player'

import { usePlaybackTimeline } from './usePlaybackTimeline'

interface FakePlayerOptions {
  currentTime?: number
  duration?: number
  seekable?: [number, number] | null
}

function createFakePlayer({
  currentTime = 0,
  duration = 0,
  seekable = null
}: FakePlayerOptions = {}) {
  const ranges =
    seekable === null
      ? null
      : {
          length: 1,
          end: (index: number) => (index === 0 ? seekable[1] : 0),
          start: (index: number) => (index === 0 ? seekable[0] : 0)
        }

  return {
    currentTime: vi.fn((seconds?: number) =>
      seconds === undefined ? currentTime : undefined
    ),
    duration: vi.fn(() => duration),
    seekable: vi.fn(() => ranges)
  }
}

interface SetupOptions extends FakePlayerOptions {
  duration?: number
  isTranscoded?: boolean
  probedDuration?: number | null
  startSeconds?: number
}

function setup({
  currentTime = 0,
  duration = 0,
  isTranscoded = true,
  probedDuration = 2700,
  seekable = [0, 120],
  startSeconds = 0
}: SetupOptions = {}) {
  const player = createFakePlayer({ currentTime, duration, seekable })
  const onRestart = vi.fn()

  const { result } = renderHook(() =>
    usePlaybackTimeline({
      duration: probedDuration,
      isTranscoded,
      onRestart,
      player: player as unknown as Player,
      startSeconds
    })
  )

  return { onRestart, player, timeline: result.current }
}

// The bug this guards: a transcode only produces output forward from where it
// started, so its HLS playlist is "live" and VHS silently snaps any seek past
// the transcode head back to the live edge. Clicking the trackbar past the
// buffered part did nothing at all. Anything out of reach has to restart the
// transcode at the target instead of being handed to the player.
describe('usePlaybackTimeline', () => {
  it('restarts the transcode when seeking past the transcode head', () => {
    const { onRestart, player, timeline } = setup()

    timeline.seek(1800)

    expect(onRestart).toHaveBeenCalledTimes(1)
    expect(onRestart).toHaveBeenCalledWith(1800)
    expect(player.currentTime).not.toHaveBeenCalledWith(1800)
  })

  it('seeks natively inside the reachable window', () => {
    const { onRestart, player, timeline } = setup()

    timeline.seek(60)

    expect(player.currentTime).toHaveBeenCalledWith(60)
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('reports the absolute position of a session started mid-file', () => {
    const { timeline } = setup({ currentTime: 42, startSeconds: 1800 })

    expect(timeline.currentTime()).toEqual(1842)
  })

  it('reports the absolute duration and reachable end of a session started mid-file', () => {
    const { timeline } = setup({ seekable: [0, 120], startSeconds: 1800 })

    expect(timeline.duration()).toEqual(2700)
    expect(timeline.reachableEnd()).toEqual(1920)
  })

  it('seeks natively within a session started mid-file', () => {
    const { onRestart, player, timeline } = setup({ startSeconds: 1800 })

    timeline.seek(1805)

    expect(player.currentTime).toHaveBeenCalledWith(5)
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('restarts the transcode when seeking back before the session start', () => {
    const { onRestart, player, timeline } = setup({ startSeconds: 1800 })

    timeline.seek(10)

    expect(onRestart).toHaveBeenCalledWith(10)
    expect(player.currentTime).not.toHaveBeenCalledWith(10)
  })

  it('tolerates a seek landing just past the transcode head', () => {
    const { onRestart, player, timeline } = setup({ seekable: [0, 120] })

    timeline.seek(121)

    expect(player.currentTime).toHaveBeenCalledWith(121)
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('clamps a seek past the end of the file instead of restarting out of range', () => {
    const { onRestart, player, timeline } = setup({ startSeconds: 1800 })

    timeline.seek(9999)

    expect(onRestart).toHaveBeenCalledWith(2700)
    expect(player.currentTime).not.toHaveBeenCalledWith(9999)
  })

  // Direct play serves byte ranges, so the browser can seek anywhere on its
  // own — it was never affected by this bug and must stay untouched.
  it('always seeks natively on a direct-play source', () => {
    const { onRestart, player, timeline } = setup({
      duration: 2700,
      isTranscoded: false,
      probedDuration: null,
      seekable: [0, 2700]
    })

    timeline.seek(1800)

    expect(player.currentTime).toHaveBeenCalledWith(1800)
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('reports the player duration for a direct-play source', () => {
    const { timeline } = setup({
      duration: 2700,
      isTranscoded: false,
      probedDuration: null,
      seekable: [0, 2700]
    })

    expect(timeline.duration()).toEqual(2700)
    expect(timeline.reachableEnd()).toEqual(2700)
  })
})
