import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import type { Episode, Show } from '../lib/media'
import { UpNextOverlay } from './UpNextOverlay'

const show: Show = {
  id: 1,
  title: 'Test Show',
  folderPath: '/shows/test',
  externalId: null,
  year: null,
  overview: null,
  genres: null,
  rating: null,
  posterUrl: null,
  backdropUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const nextEpisode: Episode = {
  id: 2,
  showId: 1,
  seasonId: 1,
  seasonNumber: 1,
  episodeNumber: 2,
  title: 'Second Episode',
  filePath: '/shows/test/s1e2.mp4',
  fileName: 's1e2.mp4',
  fileSize: null,
  extension: 'mp4',
  externalId: null,
  overview: null,
  runtime: null,
  stillUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

// jsdom doesn't implement the Web Animations API, so we stub `animate` with a
// fake that records `cancel()` calls. The visual fill is a browser concern;
// these tests verify the auto-advance and click semantics, which run on
// setTimeout — fully covered by fake timers.
interface FakeAnimation {
  cancel: () => void
}

function stubAnimate(): void {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: (): FakeAnimation => ({ cancel: () => {} })
  })
}

describe('UpNextOverlay', () => {
  beforeEach(() => {
    stubAnimate()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-advances after the countdown plus the full-bar hold', () => {
    const onPlayNow = vi.fn()

    render(
      <UpNextOverlay
        countdownSeconds={9}
        isCountingDown
        nextEpisode={nextEpisode}
        onCancel={() => {}}
        onPlayNow={onPlayNow}
        show={show}
      />
    )

    act(() => {
      vi.advanceTimersByTime(9 * 1000)
    })

    expect(onPlayNow).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onPlayNow).toHaveBeenCalledTimes(1)
  })

  it('does not auto-advance while in peek mode (isCountingDown=false)', () => {
    const onPlayNow = vi.fn()

    render(
      <UpNextOverlay
        countdownSeconds={9}
        isCountingDown={false}
        nextEpisode={nextEpisode}
        onCancel={() => {}}
        onPlayNow={onPlayNow}
        show={show}
      />
    )

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(onPlayNow).not.toHaveBeenCalled()
  })

  it('clicking the Next episode button fires onPlayNow exactly once', () => {
    const onPlayNow = vi.fn()

    render(
      <UpNextOverlay
        countdownSeconds={9}
        isCountingDown
        nextEpisode={nextEpisode}
        onCancel={() => {}}
        onPlayNow={onPlayNow}
        show={show}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /next episode/i }))

    expect(onPlayNow).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(onPlayNow).toHaveBeenCalledTimes(1)
  })

  it('Cancel stops the countdown without firing onPlayNow', () => {
    const onPlayNow = vi.fn()
    const onCancel = vi.fn()

    const { rerender } = render(
      <UpNextOverlay
        countdownSeconds={9}
        isCountingDown
        nextEpisode={nextEpisode}
        onCancel={onCancel}
        onPlayNow={onPlayNow}
        show={show}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)

    // The parent reacts to onCancel by flipping isCountingDown off.
    rerender(
      <UpNextOverlay
        countdownSeconds={9}
        isCountingDown={false}
        nextEpisode={nextEpisode}
        onCancel={onCancel}
        onPlayNow={onPlayNow}
        show={show}
      />
    )

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(onPlayNow).not.toHaveBeenCalled()
  })

  it('survives re-renders during the countdown without restarting the timer', () => {
    const onPlayNow = vi.fn()

    const { rerender } = render(
      <UpNextOverlay
        countdownSeconds={9}
        isCountingDown
        nextEpisode={nextEpisode}
        onCancel={() => {}}
        onPlayNow={onPlayNow}
        show={show}
      />
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // Simulate the parent re-rendering with a brand-new onPlayNow identity —
    // this used to cancel the countdown and prevent auto-advance.
    rerender(
      <UpNextOverlay
        countdownSeconds={9}
        isCountingDown
        nextEpisode={nextEpisode}
        onCancel={() => {}}
        onPlayNow={() => {
          onPlayNow()
        }}
        show={show}
      />
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(onPlayNow).toHaveBeenCalledTimes(1)
  })
})
