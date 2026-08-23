import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type Player from 'video.js/dist/types/player'

import { usePlaybackTimeline } from './usePlaybackTimeline'
import { useRestoreProgress } from './useRestoreProgress'
import type { WatchProgress } from './useWatchData'

function createFakePlayer(seekableEnd: number) {
  return {
    currentTime: vi.fn(() => 0),
    duration: vi.fn(() => 2700),
    seekable: vi.fn(() => ({
      length: 1,
      end: () => seekableEnd,
      start: () => 0
    }))
  }
}

interface SetupOptions {
  isSourceReady?: boolean
  isTranscoded?: boolean
  savedProgress?: WatchProgress
  seekableEnd?: number
}

function setup(options: SetupOptions = {}) {
  const {
    isSourceReady = true,
    isTranscoded = true,
    seekableEnd = 30
  } = options
  const savedProgress =
    'savedProgress' in options
      ? options.savedProgress
      : { currentTime: 1800, duration: 2700 }

  const player = createFakePlayer(seekableEnd)
  const onRestart = vi.fn()

  const view = renderHook(
    (props: { mediaKey: string; savedProgress: WatchProgress | undefined }) => {
      const timeline = usePlaybackTimeline({
        duration: isTranscoded ? 2700 : null,
        isTranscoded,
        onRestart,
        player: player as unknown as Player,
        startSeconds: 0
      })

      useRestoreProgress({
        isSourceReady,
        mediaKey: props.mediaKey,
        savedProgress: props.savedProgress,
        timeline
      })
    },
    { initialProps: { mediaKey: 'movie-1', savedProgress } }
  )

  return { onRestart, player, view }
}

// Resuming a transcoded file was broken in the same way seeking was: the
// transcode starts at 0 and its live playlist only lists what it has produced,
// so a plain seek to 30 minutes got snapped straight back to the beginning.
describe('useRestoreProgress', () => {
  it('starts a transcoded file at the saved position instead of seeking into an unavailable region', () => {
    const { onRestart, player } = setup()

    expect(onRestart).toHaveBeenCalledTimes(1)
    expect(onRestart).toHaveBeenCalledWith(1800)
    expect(player.currentTime).not.toHaveBeenCalledWith(1800)
  })

  it('seeks a direct-play file to the saved position', () => {
    const { onRestart, player } = setup({
      isTranscoded: false,
      seekableEnd: 2700
    })

    expect(player.currentTime).toHaveBeenCalledWith(1800)
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('waits for the source before restoring, so it knows how the file plays', () => {
    const { onRestart, player } = setup({ isSourceReady: false })

    expect(onRestart).not.toHaveBeenCalled()
    expect(player.currentTime).not.toHaveBeenCalledWith(1800)
  })

  it('starts from the beginning when the media was already finished', () => {
    const { onRestart, player } = setup({
      savedProgress: { currentTime: 2600, duration: 2700 }
    })

    expect(onRestart).not.toHaveBeenCalled()
    expect(player.currentTime).not.toHaveBeenCalledWith(2600)
  })

  it('does not restore again when the same progress is refetched', () => {
    const { onRestart, view } = setup()

    view.rerender({
      mediaKey: 'movie-1',
      savedProgress: { currentTime: 1800, duration: 2700 }
    })

    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('restores nothing when there is no saved progress', () => {
    const { onRestart, player } = setup({ savedProgress: undefined })

    expect(onRestart).not.toHaveBeenCalled()
    expect(player.currentTime).not.toHaveBeenCalled()
  })
})
