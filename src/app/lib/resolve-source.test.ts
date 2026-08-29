import { describe, expect, it } from 'vitest'

import { audioCodecRequiresTranscode } from './resolve-source'

describe('audioCodecRequiresTranscode', () => {
  it.each(['aac', 'flac', 'mp3', 'opus', 'vorbis'] as const)(
    'direct-plays %s',
    codec => {
      expect(audioCodecRequiresTranscode(codec)).toEqual(false)
    }
  )

  it.each(['pcm-f32', 'pcm-s16', 'pcm-s24be'] as const)(
    'direct-plays the pcm variant %s',
    codec => {
      expect(audioCodecRequiresTranscode(codec)).toEqual(false)
    }
  )

  it.each(['ac3', 'eac3'] as const)(
    'transcodes %s, which media elements cannot decode',
    codec => {
      expect(audioCodecRequiresTranscode(codec)).toEqual(true)
    }
  )

  it.each(['alaw', 'ulaw'] as const)('transcodes G.711 %s', codec => {
    expect(audioCodecRequiresTranscode(codec)).toEqual(true)
  })

  it('transcodes when the codec could not be identified', () => {
    expect(audioCodecRequiresTranscode(null)).toEqual(true)
  })
})
