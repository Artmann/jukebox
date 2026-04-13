import { describe, expect, it } from 'vitest'

import { buildGenreRows, parseGenres } from './genres'
import type { MediaItem } from './media'

function makeMovie(id: number, title: string, genres: string | null): MediaItem {
  return {
    type: 'movie',
    item: {
      id,
      title,
      filePath: `/movies/${title}.mp4`,
      fileName: `${title}.mp4`,
      fileSize: null,
      extension: '.mp4',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      year: null,
      overview: null,
      runtime: null,
      genres,
      rating: null,
      posterPath: null,
      backdropPath: null,
      trailerUrl: null
    }
  }
}

describe('parseGenres', () => {
  it('parses a JSON array of strings', () => {
    expect(parseGenres('["Action","Comedy"]')).toEqual(['Action', 'Comedy'])
  })

  it('returns empty array for null', () => {
    expect(parseGenres(null)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseGenres('')).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseGenres('not json')).toEqual([])
  })

  it('returns empty array for non-array JSON', () => {
    expect(parseGenres('{"genre":"Action"}')).toEqual([])
  })

  it('filters out non-string values', () => {
    expect(parseGenres('[1, "Action", null, "Comedy", true]')).toEqual([
      'Action',
      'Comedy'
    ])
  })
})

describe('buildGenreRows', () => {
  it('groups items by genre', () => {
    const items = [
      makeMovie(1, 'Movie A', '["Action","Comedy"]'),
      makeMovie(2, 'Movie B', '["Action"]'),
      makeMovie(3, 'Movie C', '["Comedy","Drama"]'),
      makeMovie(4, 'Movie D', '["Drama"]')
    ]

    const rows = buildGenreRows(items)

    expect(rows.map((row) => row.genre)).toEqual(['Action', 'Comedy', 'Drama'])
  })

  it('sorts by item count descending', () => {
    const items = [
      makeMovie(1, 'A', '["Drama"]'),
      makeMovie(2, 'B', '["Drama"]'),
      makeMovie(3, 'C', '["Drama","Action"]'),
      makeMovie(4, 'D', '["Action"]')
    ]

    const rows = buildGenreRows(items)

    expect(rows[0]?.genre).toEqual('Drama')
    expect(rows[0]?.items.length).toEqual(3)
  })

  it('filters out genres with fewer than minimum items', () => {
    const items = [
      makeMovie(1, 'A', '["Action"]'),
      makeMovie(2, 'B', '["Comedy"]'),
      makeMovie(3, 'C', '["Comedy"]')
    ]

    const rows = buildGenreRows(items)

    expect(rows).toEqual([
      { genre: 'Comedy', items: [items[1], items[2]] }
    ])
  })

  it('respects limit parameter', () => {
    const items = [
      makeMovie(1, 'A', '["Action","Comedy","Drama"]'),
      makeMovie(2, 'B', '["Action","Comedy","Drama"]'),
      makeMovie(3, 'C', '["Action","Comedy"]')
    ]

    const rows = buildGenreRows(items, 2)

    expect(rows.length).toEqual(2)
  })

  it('respects custom minimumItems', () => {
    const items = [
      makeMovie(1, 'A', '["Action"]'),
      makeMovie(2, 'B', '["Action"]'),
      makeMovie(3, 'C', '["Action"]'),
      makeMovie(4, 'D', '["Comedy"]'),
      makeMovie(5, 'E', '["Comedy"]')
    ]

    const rows = buildGenreRows(items, undefined, 3)

    expect(rows.length).toEqual(1)
    expect(rows[0]?.genre).toEqual('Action')
  })

  it('returns empty array for empty input', () => {
    expect(buildGenreRows([])).toEqual([])
  })

  it('returns empty array when no genres have enough items', () => {
    const items = [
      makeMovie(1, 'A', '["Action"]'),
      makeMovie(2, 'B', '["Comedy"]')
    ]

    expect(buildGenreRows(items)).toEqual([])
  })

  it('handles items with no genres', () => {
    const items = [
      makeMovie(1, 'A', null),
      makeMovie(2, 'B', '["Action"]'),
      makeMovie(3, 'C', '["Action"]')
    ]

    const rows = buildGenreRows(items)

    expect(rows.length).toEqual(1)
    expect(rows[0]?.genre).toEqual('Action')
  })
})
