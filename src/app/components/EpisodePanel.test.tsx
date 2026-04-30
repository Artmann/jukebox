import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import invariant from 'tiny-invariant'

import type { Episode, SeasonWithEpisodes } from '../lib/media'
import { EpisodePanel } from './EpisodePanel'

function episodeAt(season: SeasonWithEpisodes, index: number): Episode {
  const episode = season.episodes[index]
  invariant(episode, `Expected episode at index ${index}`)
  return episode
}

function makeEpisode(overrides: Partial<Episode> & Pick<Episode, 'id' | 'episodeNumber' | 'title'>): Episode {
  return {
    showId: 1,
    seasonId: 1,
    seasonNumber: 1,
    filePath: `/shows/test/s1e${overrides.episodeNumber}.mp4`,
    fileName: `s1e${overrides.episodeNumber}.mp4`,
    fileSize: null,
    extension: 'mp4',
    externalId: null,
    overview: null,
    runtime: null,
    stillUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

const firstEpisode: Episode = {
  id: 1,
  showId: 1,
  seasonId: 1,
  seasonNumber: 1,
  episodeNumber: 1,
  title: 'First Episode',
  filePath: '/shows/test/s1e1.mp4',
  fileName: 's1e1.mp4',
  fileSize: null,
  extension: 'mp4',
  externalId: null,
  overview: null,
  runtime: null,
  stillUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const secondEpisode: Episode = {
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

const seasonOne: SeasonWithEpisodes = {
  id: 1,
  showId: 1,
  seasonNumber: 1,
  name: 'Season 1',
  overview: null,
  posterUrl: null,
  episodeCount: 2,
  episodes: [firstEpisode, secondEpisode]
}

const seasonTwo: SeasonWithEpisodes = {
  id: 2,
  showId: 1,
  seasonNumber: 2,
  name: 'Season 2',
  overview: null,
  posterUrl: null,
  episodeCount: 0,
  episodes: []
}

describe('EpisodePanel', () => {
  it('calls onClose when an episode is selected', () => {
    const onSelectEpisode = vi.fn()
    const onClose = vi.fn()

    render(
      <EpisodePanel
        currentEpisodeId={1}
        onClose={onClose}
        onSelectEpisode={onSelectEpisode}
        onSelectSeason={() => {}}
        seasons={[seasonOne]}
        selectedSeason={1}
        showTitle="Test Show"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Second Episode/ }))

    expect(onSelectEpisode).toHaveBeenCalledWith(secondEpisode)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when a season tab is clicked', () => {
    const onClose = vi.fn()
    const onSelectSeason = vi.fn()

    render(
      <EpisodePanel
        currentEpisodeId={1}
        onClose={onClose}
        onSelectEpisode={() => {}}
        onSelectSeason={onSelectSeason}
        seasons={[seasonOne, seasonTwo]}
        selectedSeason={1}
        showTitle="Test Show"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Season 2' }))

    expect(onSelectSeason).toHaveBeenCalledWith(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  describe('watch state visuals', () => {
    it('shows a check icon and a full progress bar for watched episodes', () => {
      render(
        <EpisodePanel
          currentEpisodeId={1}
          onClose={() => {}}
          onSelectEpisode={() => {}}
          onSelectSeason={() => {}}
          progressMap={{
            2: { currentTime: 95, duration: 100 }
          }}
          seasons={[seasonOne]}
          selectedSeason={1}
          showTitle="Test Show"
        />
      )

      const watchedRow = screen.getByRole('button', { name: /Second Episode/ })

      expect(watchedRow.querySelector('.lucide-check')).not.toBeNull()
      expect(screen.queryByText('Watched')).toBeNull()

      const fill = watchedRow.querySelector<HTMLElement>('.bg-white\\/40')
      expect(fill).not.toBeNull()
      expect(fill?.style.width).toEqual('100%')

      const unwatchedRow = screen.getByRole('button', { name: /First Episode/ })
      expect(unwatchedRow.querySelector('.lucide-check')).toBeNull()
      expect(unwatchedRow.querySelector('[style*="width"]')).toBeNull()
    })

    it('shows a partial red progress bar for in-progress episodes', () => {
      render(
        <EpisodePanel
          currentEpisodeId={1}
          onClose={() => {}}
          onSelectEpisode={() => {}}
          onSelectSeason={() => {}}
          progressMap={{
            2: { currentTime: 30, duration: 100 }
          }}
          seasons={[seasonOne]}
          selectedSeason={1}
          showTitle="Test Show"
        />
      )

      const row = screen.getByRole('button', { name: /Second Episode/ })

      expect(row.querySelector('.lucide-check')).toBeNull()

      const fill = row.querySelector<HTMLElement>('.bg-red-600')
      expect(fill).not.toBeNull()
      expect(fill?.style.width).toEqual('30%')
    })

    it('renders no progress bar or check for episodes that have never been started', () => {
      render(
        <EpisodePanel
          currentEpisodeId={1}
          onClose={() => {}}
          onSelectEpisode={() => {}}
          onSelectSeason={() => {}}
          seasons={[seasonOne]}
          selectedSeason={1}
          showTitle="Test Show"
        />
      )

      const row = screen.getByRole('button', { name: /Second Episode/ })

      expect(row.querySelector('.lucide-check')).toBeNull()
      expect(row.querySelector('[style*="width"]')).toBeNull()
    })
  })

  describe('auto-scroll on open', () => {
    const rowHeight = 60
    const containerHeight = 400

    function mockLayout(
      element: HTMLElement,
      values: { clientHeight?: number; scrollHeight?: number }
    ): void {
      for (const [key, value] of Object.entries(values)) {
        Object.defineProperty(element, key, { configurable: true, value })
      }
    }

    function makeLongSeason(count: number): SeasonWithEpisodes {
      return {
        id: 99,
        showId: 1,
        seasonNumber: 9,
        name: 'Season 9',
        overview: null,
        posterUrl: null,
        episodeCount: count,
        episodes: Array.from({ length: count }, (_, index) =>
          makeEpisode({
            id: 1000 + index,
            episodeNumber: index + 1,
            seasonNumber: 9,
            title: `Episode ${index + 1}`
          })
        )
      }
    }

    function patchGetBoundingClientRect(): () => void {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = HTMLElement.prototype.getBoundingClientRect

      HTMLElement.prototype.getBoundingClientRect = function () {
        const rowIndex = this.getAttribute('data-test-row-index')

        if (rowIndex !== null) {
          const top = Number(rowIndex) * rowHeight
          return {
            top,
            bottom: top + rowHeight,
            left: 0,
            right: 384,
            width: 384,
            height: rowHeight,
            x: 0,
            y: top,
            toJSON: () => ({})
          } as DOMRect
        }

        if (this.getAttribute('data-test-scroll-container') === 'true') {
          return {
            top: 0,
            bottom: containerHeight,
            left: 0,
            right: 384,
            width: 384,
            height: containerHeight,
            x: 0,
            y: 0,
            toJSON: () => ({})
          } as DOMRect
        }

        return original.call(this)
      }

      return () => {
        HTMLElement.prototype.getBoundingClientRect = original
      }
    }

    function attachMocks(container: HTMLElement, totalHeight: number): HTMLElement {
      const scroller = container.querySelector('.overflow-y-auto') as HTMLElement
      scroller.setAttribute('data-test-scroll-container', 'true')
      mockLayout(scroller, {
        clientHeight: containerHeight,
        scrollHeight: totalHeight
      })

      scroller.querySelectorAll('button').forEach((row, index) => {
        row.setAttribute('data-test-row-index', String(index))
        mockLayout(row as HTMLElement, { clientHeight: rowHeight })
      })

      return scroller
    }

    function renderForScroll(
      season: SeasonWithEpisodes,
      currentEpisodeId: number
    ) {
      // First render with a different current episode, attach layout mocks,
      // then re-render to the target episode so the effect sees real numbers.
      const placeholderId = episodeAt(season, 0).id
      const result = render(
        <EpisodePanel
          currentEpisodeId={
            placeholderId === currentEpisodeId
              ? episodeAt(season, 1).id
              : placeholderId
          }
          onClose={() => {}}
          onSelectEpisode={() => {}}
          onSelectSeason={() => {}}
          seasons={[season]}
          selectedSeason={season.seasonNumber}
          showTitle="Long Show"
        />
      )

      const scroller = attachMocks(
        result.container,
        rowHeight * season.episodes.length
      )

      result.rerender(
        <EpisodePanel
          currentEpisodeId={currentEpisodeId}
          onClose={() => {}}
          onSelectEpisode={() => {}}
          onSelectSeason={() => {}}
          seasons={[season]}
          selectedSeason={season.seasonNumber}
          showTitle="Long Show"
        />
      )

      return scroller
    }

    it('scrolls so the current episode is centered in the list', () => {
      const restore = patchGetBoundingClientRect()

      try {
        const longSeason = makeLongSeason(20)
        const scroller = renderForScroll(longSeason, episodeAt(longSeason, 9).id)

        // Centered: 9 * 60 - 400/2 + 60/2 = 370
        expect(scroller.scrollTop).toEqual(370)
      } finally {
        restore()
      }
    })

    it('clamps scroll to the bottom when the current episode is near the end', () => {
      const restore = patchGetBoundingClientRect()

      try {
        const longSeason = makeLongSeason(20)
        const totalHeight = rowHeight * longSeason.episodes.length
        const maxScroll = totalHeight - containerHeight

        const scroller = renderForScroll(
          longSeason,
          episodeAt(longSeason, 19).id
        )

        // Centered would be 19 * 60 - 200 + 30 = 970, clamped to maxScroll = 800.
        expect(scroller.scrollTop).toEqual(maxScroll)
      } finally {
        restore()
      }
    })
  })
})
