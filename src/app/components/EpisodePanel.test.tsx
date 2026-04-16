import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { Episode, SeasonWithEpisodes } from '../lib/media'
import { EpisodePanel } from './EpisodePanel'

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
  tmdbId: null,
  overview: null,
  runtime: null,
  stillPath: null,
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
  tmdbId: null,
  overview: null,
  runtime: null,
  stillPath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const seasonOne: SeasonWithEpisodes = {
  id: 1,
  showId: 1,
  seasonNumber: 1,
  name: 'Season 1',
  overview: null,
  posterPath: null,
  episodeCount: 2,
  episodes: [firstEpisode, secondEpisode]
}

const seasonTwo: SeasonWithEpisodes = {
  id: 2,
  showId: 1,
  seasonNumber: 2,
  name: 'Season 2',
  overview: null,
  posterPath: null,
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
})
