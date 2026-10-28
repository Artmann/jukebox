import { describe, expect, it } from 'vitest'

import type {
  ContinueWatchingItem,
  Episode,
  Movie,
  Show,
  UpNextItem
} from '../../api/contract'
import { resolveTitleLink } from './title-link'

const movie: Movie = {
  backdropUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  extension: 'mp4',
  externalId: null,
  fileName: 'trap.mp4',
  filePath: '/movies/trap.mp4',
  fileSize: null,
  genres: null,
  id: 7,
  overview: null,
  posterUrl: null,
  rating: null,
  runtime: 106,
  title: 'Trap',
  trailerUrl: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  year: 2024
}

const show: Show = {
  backdropUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  externalId: null,
  folderPath: '/shows/succession',
  genres: null,
  id: 3,
  overview: null,
  posterUrl: null,
  rating: null,
  title: 'Succession',
  updatedAt: '2026-01-01T00:00:00.000Z',
  year: 2018
}

function makeEpisode(id: number): Episode {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    episodeNumber: id,
    extension: 'mp4',
    externalId: null,
    fileName: `e${id}.mp4`,
    filePath: `/shows/succession/e${id}.mp4`,
    fileSize: null,
    id,
    overview: null,
    runtime: null,
    seasonId: 1,
    seasonNumber: 1,
    showId: show.id,
    stillUrl: null,
    title: `Episode ${id}`,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const inProgressMovie: ContinueWatchingItem = {
  currentTime: 600,
  duration: 6000,
  movie,
  type: 'movie',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const inProgressEpisode: ContinueWatchingItem = {
  currentTime: 600,
  duration: 3000,
  episode: makeEpisode(21),
  show,
  type: 'episode',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const upNextEpisode: UpNextItem = {
  episode: makeEpisode(22),
  lastWatchedAt: '2026-01-01T00:00:00.000Z',
  show
}

describe('resolveTitleLink', () => {
  it('links titles the viewer has not started to their landing pages', () => {
    expect([
      resolveTitleLink({ item: movie, type: 'movie' }, [], []),
      resolveTitleLink({ item: show, type: 'show' }, [], [])
    ]).toEqual(['/movies/7', '/shows/3'])
  })

  it('links an in-progress movie straight to the player', () => {
    expect(
      resolveTitleLink({ item: movie, type: 'movie' }, [inProgressMovie], [])
    ).toEqual('/watch/7')
  })

  it('links a show to its in-progress episode before its up next episode', () => {
    expect(
      resolveTitleLink(
        { item: show, type: 'show' },
        [inProgressEpisode],
        [upNextEpisode]
      )
    ).toEqual('/watch/episode/21')
  })

  it('links a show to its up next episode', () => {
    expect(
      resolveTitleLink({ item: show, type: 'show' }, [], [upNextEpisode])
    ).toEqual('/watch/episode/22')
  })
})
