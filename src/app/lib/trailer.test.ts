import { describe, expect, it } from 'vitest'

import { getYouTubeEmbedUrl } from './trailer'

describe('getYouTubeEmbedUrl', () => {
  it('builds an embed url from a watch url', () => {
    expect(
      getYouTubeEmbedUrl('https://www.youtube.com/watch?v=abc123&t=10')
    ).toEqual(
      'https://www.youtube.com/embed/abc123?autoplay=1&mute=0&controls=0&modestbranding=1'
    )
  })

  it('returns null for missing or unknown urls', () => {
    expect([
      getYouTubeEmbedUrl(null),
      getYouTubeEmbedUrl('https://vimeo.com/123')
    ]).toEqual([null, null])
  })
})
