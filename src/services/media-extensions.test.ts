import { describe, expect, it } from 'vitest'

import { isSubtitleFile, isVideoFile } from './media-extensions'

describe('isVideoFile', () => {
  it('matches common lowercase extensions', () => {
    expect(isVideoFile('/library/movie.mkv')).toEqual(true)
    expect(isVideoFile('clip.mp4')).toEqual(true)
  })

  it('is case insensitive', () => {
    expect(isVideoFile('/library/MOVIE.MKV')).toEqual(true)
    expect(isVideoFile('Clip.Mp4')).toEqual(true)
  })

  it('rejects paths without an extension', () => {
    expect(isVideoFile('/library/movie')).toEqual(false)
    expect(isVideoFile('README')).toEqual(false)
  })

  it('rejects unrelated extensions', () => {
    expect(isVideoFile('/library/movie.srt')).toEqual(false)
    expect(isVideoFile('/library/poster.jpg')).toEqual(false)
  })
})

describe('isSubtitleFile', () => {
  it('matches common lowercase extensions', () => {
    expect(isSubtitleFile('/library/movie.srt')).toEqual(true)
    expect(isSubtitleFile('/library/movie.vtt')).toEqual(true)
    expect(isSubtitleFile('/library/movie.ass')).toEqual(true)
  })

  it('is case insensitive', () => {
    expect(isSubtitleFile('/library/movie.SRT')).toEqual(true)
    expect(isSubtitleFile('/library/Movie.Vtt')).toEqual(true)
  })

  it('rejects paths without an extension', () => {
    expect(isSubtitleFile('/library/movie')).toEqual(false)
  })

  it('rejects unrelated extensions', () => {
    expect(isSubtitleFile('/library/movie.mkv')).toEqual(false)
    expect(isSubtitleFile('/library/notes.txt')).toEqual(false)
  })
})
