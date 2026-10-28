import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { Episode, SeasonWithEpisodes } from '../lib/media'
import type { EpisodeProgressMap } from '../lib/resume-target'
import { EpisodeOverlay } from './EpisodeOverlay'

function makeEpisode(id: number, title: string): Episode {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    episodeNumber: id,
    extension: 'mp4',
    externalId: null,
    fileName: `s1e${id}.mp4`,
    filePath: `/shows/test/s1e${id}.mp4`,
    fileSize: null,
    id,
    overview: null,
    runtime: 42,
    seasonId: 1,
    seasonNumber: 1,
    showId: 1,
    stillUrl: null,
    title,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const firstEpisode = makeEpisode(1, 'First Episode')
const secondEpisode = makeEpisode(2, 'Second Episode')

const seasonOne: SeasonWithEpisodes = {
  episodeCount: 2,
  episodes: [firstEpisode, secondEpisode],
  id: 1,
  name: 'Season 1',
  overview: null,
  posterUrl: null,
  seasonNumber: 1,
  showId: 1
}

function renderOverlay({
  onOpenChange = () => {},
  onSelectEpisode = () => {},
  progressMap
}: {
  onOpenChange?: (open: boolean) => void
  onSelectEpisode?: (episode: Episode) => void
  progressMap?: EpisodeProgressMap
} = {}) {
  return render(
    <EpisodeOverlay
      currentEpisodeId={1}
      fallbackImageUrl={null}
      onOpenChange={onOpenChange}
      onSelectEpisode={onSelectEpisode}
      onSelectSeason={() => {}}
      open
      progressMap={progressMap}
      seasons={[seasonOne]}
      selectedSeason={1}
      showTitle="Test Show"
    />
  )
}

describe('EpisodeOverlay', () => {
  it('plays the picked episode and closes', () => {
    const onOpenChange = vi.fn()
    const onSelectEpisode = vi.fn()

    renderOverlay({ onOpenChange, onSelectEpisode })

    fireEvent.click(screen.getByRole('button', { name: /Second Episode/ }))

    expect({
      openChanges: onOpenChange.mock.calls,
      selections: onSelectEpisode.mock.calls
    }).toEqual({ openChanges: [[false]], selections: [[secondEpisode]] })
  })

  it('closes from the close button', () => {
    const onOpenChange = vi.fn()

    renderOverlay({ onOpenChange })

    fireEvent.click(screen.getByRole('button', { name: 'Close episodes' }))

    expect(onOpenChange.mock.calls).toEqual([[false]])
  })

  it('marks the episode that is playing', () => {
    renderOverlay()

    expect({
      current: screen
        .getByRole('button', { name: /First Episode/ })
        .getAttribute('aria-current'),
      other: screen
        .getByRole('button', { name: /Second Episode/ })
        .getAttribute('aria-current')
    }).toEqual({ current: 'true', other: null })
  })

  it('shows a check and a full bar for watched episodes', () => {
    renderOverlay({ progressMap: { 2: { currentTime: 95, duration: 100 } } })

    const watchedCard = screen.getByRole('button', { name: /Second Episode/ })
    const unwatchedCard = screen.getByRole('button', { name: /First Episode/ })

    expect({
      unwatchedBar: unwatchedCard.querySelector('[style*="width"]'),
      unwatchedCheck: unwatchedCard.querySelector('.lucide-check'),
      watchedBar:
        watchedCard.querySelector<HTMLElement>('.bg-white\\/60')?.style.width,
      watchedCheck: watchedCard.querySelector('.lucide-check') !== null
    }).toEqual({
      unwatchedBar: null,
      unwatchedCheck: null,
      watchedBar: '100%',
      watchedCheck: true
    })
  })

  it('shows a partial red bar for in-progress episodes', () => {
    renderOverlay({ progressMap: { 2: { currentTime: 30, duration: 100 } } })

    const card = screen.getByRole('button', { name: /Second Episode/ })

    expect({
      bar: card.querySelector<HTMLElement>('.bg-red-600')?.style.width,
      check: card.querySelector('.lucide-check')
    }).toEqual({ bar: '30%', check: null })
  })
})
