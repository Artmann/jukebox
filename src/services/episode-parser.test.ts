import { describe, expect, it } from 'vitest'

import { parseEpisodeFilename } from './episode-parser'

describe('parseEpisodeFilename', () => {
  it('parses standard SxxExx format', () => {
    expect(
      parseEpisodeFilename('Silicon Valley S04E01 Success Failure.mkv')
    ).toEqual({
      seasonNumber: 4,
      episodeNumber: 1,
      title: 'Success Failure'
    })
  })

  it('parses dot-separated SxxExx format', () => {
    expect(
      parseEpisodeFilename('Buffy.S01E01.Welcome.To.The.Hellmouth + C.mkv')
    ).toEqual({
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Welcome To The Hellmouth + C'
    })
  })

  it('parses lowercase SxxExx', () => {
    expect(
      parseEpisodeFilename('Relic Hunter S01e01 Buddha\'s Bowl.mkv')
    ).toEqual({
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Buddha\'s Bowl'
    })
  })

  it('returns null for non-episode files', () => {
    expect(parseEpisodeFilename('Buffy.S01EX1.Interview.mkv')).toEqual(null)
  })

  it('returns null for image files', () => {
    expect(parseEpisodeFilename('Buffy_the_Vampire_Slayer_(logo).jpg')).toEqual(null)
  })

  it('returns null for text files', () => {
    expect(parseEpisodeFilename('Read Me.txt')).toEqual(null)
  })

  it('handles episode with no title after SxxExx', () => {
    expect(parseEpisodeFilename('Show.S02E05.mkv')).toEqual({
      seasonNumber: 2,
      episodeNumber: 5,
      title: null
    })
  })

  it('strips technical info from episode title', () => {
    expect(
      parseEpisodeFilename('Show.S01E03.Episode.Title.720p.HDTV.x264.mkv')
    ).toEqual({
      seasonNumber: 1,
      episodeNumber: 3,
      title: 'Episode Title'
    })
  })

  it('parses double-digit season and episode numbers', () => {
    expect(
      parseEpisodeFilename('Doctor.Who.S13E07.The.Power.Of.The.Doctor.mp4')
    ).toEqual({
      seasonNumber: 13,
      episodeNumber: 7,
      title: 'The Power Of The Doctor'
    })
  })

  it('handles various video extensions', () => {
    expect(parseEpisodeFilename('Show.S01E01.Pilot.avi')).toEqual({
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot'
    })

    expect(parseEpisodeFilename('Show.S01E01.Pilot.mov')).toEqual({
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot'
    })

    expect(parseEpisodeFilename('Show.S01E01.Pilot.webm')).toEqual({
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot'
    })
  })

  it('returns null for files without SxxExx pattern', () => {
    expect(parseEpisodeFilename('Some.Random.Movie.2020.1080p.mkv')).toEqual(null)
  })

  it('strips BluRay and x265 from title', () => {
    expect(
      parseEpisodeFilename('Show.S02E03.Title.Here.1080p.BluRay.x265.mkv')
    ).toEqual({
      seasonNumber: 2,
      episodeNumber: 3,
      title: 'Title Here'
    })
  })
})
