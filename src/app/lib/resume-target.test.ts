import { describe, expect, it } from 'vitest'
import invariant from 'tiny-invariant'

import type { Episode, SeasonWithEpisodes } from './media'
import {
  episodeCode,
  findResumeTarget,
  formatRuntime,
  isWatched,
  progressPercent
} from './resume-target'

function makeEpisode(
  id: number,
  seasonNumber: number,
  episodeNumber: number
): Episode {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    episodeNumber,
    extension: 'mp4',
    externalId: null,
    fileName: `s${seasonNumber}e${episodeNumber}.mp4`,
    filePath: `/shows/test/s${seasonNumber}e${episodeNumber}.mp4`,
    fileSize: null,
    id,
    overview: null,
    runtime: null,
    seasonId: seasonNumber,
    seasonNumber,
    showId: 1,
    stillUrl: null,
    title: `Episode ${episodeNumber}`,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function makeSeason(
  seasonNumber: number,
  episodes: Episode[]
): SeasonWithEpisodes {
  return {
    episodeCount: episodes.length,
    episodes,
    id: seasonNumber,
    name: null,
    overview: null,
    posterUrl: null,
    seasonNumber,
    showId: 1
  }
}

function episodeById(
  seasons: ReadonlyArray<SeasonWithEpisodes>,
  id: number
): Episode {
  const episode = seasons
    .flatMap((season) => season.episodes)
    .find((candidate) => candidate.id === id)

  invariant(episode, `Expected episode ${id}`)

  return episode
}

const seasons = [
  makeSeason(0, [makeEpisode(100, 0, 1)]),
  makeSeason(1, [makeEpisode(1, 1, 1), makeEpisode(2, 1, 2)]),
  makeSeason(2, [makeEpisode(3, 2, 1), makeEpisode(4, 2, 2)])
]

const watched = (updatedAt: string) => ({
  currentTime: 95,
  duration: 100,
  updatedAt
})

const partial = (updatedAt: string) => ({
  currentTime: 30,
  duration: 100,
  updatedAt
})

describe('findResumeTarget', () => {
  it('starts a fresh show at the first regular episode, not the specials', () => {
    expect(findResumeTarget(seasons, undefined)).toEqual({
      episode: episodeById(seasons, 1),
      kind: 'start',
      progress: null
    })
  })

  it('resumes the episode the viewer is partway through', () => {
    const progressMap = {
      1: watched('2026-01-01T10:00:00.000Z'),
      2: partial('2026-01-02T10:00:00.000Z')
    }

    expect(findResumeTarget(seasons, progressMap)).toEqual({
      episode: episodeById(seasons, 2),
      kind: 'resume',
      progress: progressMap[2]
    })
  })

  it('moves on to the episode after the one just finished', () => {
    const progressMap = {
      1: partial('2026-01-01T10:00:00.000Z'),
      2: watched('2026-01-02T10:00:00.000Z')
    }

    expect(findResumeTarget(seasons, progressMap)).toEqual({
      episode: episodeById(seasons, 3),
      kind: 'next',
      progress: null
    })
  })

  it('falls back to an older in-progress episode after finishing the last one', () => {
    const progressMap = {
      2: partial('2026-01-01T10:00:00.000Z'),
      4: watched('2026-01-02T10:00:00.000Z')
    }

    expect(findResumeTarget(seasons, progressMap)).toEqual({
      episode: episodeById(seasons, 2),
      kind: 'resume',
      progress: progressMap[2]
    })
  })

  it('offers the first unwatched episode once the finale is watched', () => {
    const progressMap = {
      1: watched('2026-01-01T10:00:00.000Z'),
      4: watched('2026-01-02T10:00:00.000Z')
    }

    expect(findResumeTarget(seasons, progressMap)).toEqual({
      episode: episodeById(seasons, 2),
      kind: 'next',
      progress: null
    })
  })

  it('starts over when every episode is watched', () => {
    const progressMap = {
      1: watched('2026-01-01T10:00:00.000Z'),
      2: watched('2026-01-02T10:00:00.000Z'),
      3: watched('2026-01-03T10:00:00.000Z'),
      4: watched('2026-01-04T10:00:00.000Z'),
      100: watched('2026-01-05T10:00:00.000Z')
    }

    expect(findResumeTarget(seasons, progressMap)).toEqual({
      episode: episodeById(seasons, 1),
      kind: 'start',
      progress: progressMap[1]
    })
  })

  it('uses specials when a show has nothing else', () => {
    const specialsOnly = [makeSeason(0, [makeEpisode(100, 0, 1)])]

    expect(findResumeTarget(specialsOnly, undefined)).toEqual({
      episode: episodeById(specialsOnly, 100),
      kind: 'start',
      progress: null
    })
  })

  it('returns null for a show without episodes', () => {
    expect(findResumeTarget([makeSeason(1, [])], undefined)).toEqual(null)
  })
})

describe('progress helpers', () => {
  it('formats episode codes', () => {
    expect(episodeCode(makeEpisode(1, 3, 7))).toEqual('S3 E7')
  })

  it('formats runtimes', () => {
    expect([null, 45, 60, 106].map(formatRuntime)).toEqual([
      '',
      '45m',
      '1h',
      '1h 46m'
    ])
  })

  it('computes progress and watched state', () => {
    expect({
      empty: progressPercent(undefined),
      partial: progressPercent({ currentTime: 30, duration: 100 }),
      watched: isWatched({ currentTime: 95, duration: 100 }),
      withoutDuration: isWatched({ currentTime: 95, duration: null })
    }).toEqual({ empty: 0, partial: 30, watched: true, withoutDuration: false })
  })
})
