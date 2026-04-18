import { describe, it, expect } from 'vitest'
import {
  cleanTitle,
  extractYear,
  parseFilename,
  parseSubtitleFilename
} from './filename-parser'

describe('parseFilename', () => {
  it('parses standard dot-separated filenames', () => {
    expect(parseFilename('Jurassic.Park.1993.720p.BrRip.264.YIFY.mp4')).toEqual(
      {
        title: 'Jurassic Park',
        year: 1993
      }
    )
  })

  it('handles Roman numerals in titles', () => {
    expect(
      parseFilename('Jurassic.Park.III.2001.1080p.BRrip.x264.YIFY.mp4')
    ).toEqual({
      title: 'Jurassic Park III',
      year: 2001
    })

    expect(
      parseFilename(
        'Jurassic.Park.II.The.Lost.World.1997.720p.BrRip.264.YIFY.mp4'
      )
    ).toEqual({
      title: 'Jurassic Park II The Lost World',
      year: 1997
    })
  })

  it('parses short titles', () => {
    expect(parseFilename('Pig.2021.1080p.WEB-DL.DD5.1.H.264-CM.mkv')).toEqual({
      title: 'Pig',
      year: 2021
    })
  })

  it('handles long titles with EXTENDED', () => {
    expect(
      parseFilename(
        'The.Lord.of.the.Rings.the.Fellowship.of.the.Ring.EXTENDED.2001.720p.BrRip.x264.BOKUTOX.YIFY.mp4'
      )
    ).toEqual({
      title: 'The Lord of the Rings the Fellowship of the Ring EXTENDED',
      year: 2001
    })

    expect(
      parseFilename(
        'The.Lord.of.the.Rings.The.Return.of.the.King.EXTENDED.2003.1080p.BrRip.x264.YIFY.mp4'
      )
    ).toEqual({
      title: 'The Lord of the Rings The Return of the King EXTENDED',
      year: 2003
    })
  })

  it('handles BluRay source indicator', () => {
    expect(
      parseFilename('The.Prestige.2006.1080p.BluRay.x264-[YTS.AM].mp4')
    ).toEqual({
      title: 'The Prestige',
      year: 2006
    })
  })

  it('parses year in parentheses with spaces', () => {
    expect(
      parseFilename(
        'The Social Network (2010) 1080p BrRip x264 - 1.2GB - YIFY.mp4'
      )
    ).toEqual({
      title: 'The Social Network',
      year: 2010
    })
  })

  it('parses year in brackets', () => {
    expect(parseFilename('Some.Movie.[2015].720p.BluRay.mp4')).toEqual({
      title: 'Some Movie',
      year: 2015
    })
  })

  it('handles filenames without year', () => {
    expect(parseFilename('Unknown.Movie.720p.BluRay.mp4')).toEqual({
      title: 'Unknown Movie 720p BluRay',
      year: null
    })
  })

  it('handles various video extensions', () => {
    expect(parseFilename('Movie.2020.1080p.mkv').year).toBe(2020)
    expect(parseFilename('Movie.2020.1080p.avi').year).toBe(2020)
    expect(parseFilename('Movie.2020.1080p.mov').year).toBe(2020)
  })

  it('handles WEB-DL source', () => {
    expect(parseFilename('Movie.Title.2019.WEB-DL.1080p.x264.mp4')).toEqual({
      title: 'Movie Title',
      year: 2019
    })
  })

  it('handles 4K/2160p resolution', () => {
    expect(parseFilename('Epic.Movie.2022.2160p.UHD.BluRay.mp4')).toEqual({
      title: 'Epic Movie',
      year: 2022
    })
  })
})

describe('cleanTitle', () => {
  it('extracts clean title from filename', () => {
    expect(cleanTitle('Jurassic.Park.1993.720p.BrRip.264.YIFY.mp4')).toBe(
      'Jurassic Park'
    )
  })

  it('preserves title for files without year', () => {
    expect(cleanTitle('Some.Random.File.mp4')).toBe('Some Random File')
  })
})

describe('extractYear', () => {
  it('extracts year from filename', () => {
    expect(extractYear('Movie.2020.1080p.mp4')).toBe(2020)
  })

  it('extracts year from parentheses', () => {
    expect(extractYear('Movie (2020) 1080p.mp4')).toBe(2020)
  })

  it('returns null when no year present', () => {
    expect(extractYear('Movie.Without.Year.mp4')).toBeNull()
  })
})

describe('parseSubtitleFilename', () => {
  it('parses a subtitle with no language suffix', () => {
    expect(parseSubtitleFilename('Jurassic Park.srt')).toEqual({
      baseName: 'Jurassic Park',
      language: 'und',
      format: 'srt'
    })
  })

  it('parses a 2-letter language suffix', () => {
    expect(parseSubtitleFilename('Jurassic Park.en.srt')).toEqual({
      baseName: 'Jurassic Park',
      language: 'en',
      format: 'srt'
    })
  })

  it('parses a 3-letter language suffix and normalizes to 2-letter code', () => {
    expect(parseSubtitleFilename('Jurassic Park.eng.srt')).toEqual({
      baseName: 'Jurassic Park',
      language: 'en',
      format: 'srt'
    })
  })

  it('parses full English language name to a code', () => {
    expect(parseSubtitleFilename('Jurassic Park.English.srt')).toEqual({
      baseName: 'Jurassic Park',
      language: 'en',
      format: 'srt'
    })
  })

  it('parses Spanish 3-letter code (spa) and full name', () => {
    expect(parseSubtitleFilename('Movie.spa.srt')).toEqual({
      baseName: 'Movie',
      language: 'es',
      format: 'srt'
    })

    expect(parseSubtitleFilename('Movie.Spanish.srt')).toEqual({
      baseName: 'Movie',
      language: 'es',
      format: 'srt'
    })
  })

  it('preserves unknown 2-letter codes as-is', () => {
    expect(parseSubtitleFilename('Movie.zz.srt')).toEqual({
      baseName: 'Movie',
      language: 'zz',
      format: 'srt'
    })
  })

  it('parses .vtt files', () => {
    expect(parseSubtitleFilename('Movie.fr.vtt')).toEqual({
      baseName: 'Movie',
      language: 'fr',
      format: 'vtt'
    })
  })

  it('parses .ass files', () => {
    expect(parseSubtitleFilename('Movie.ja.ass')).toEqual({
      baseName: 'Movie',
      language: 'ja',
      format: 'ass'
    })
  })

  it('ignores forced/sdh modifiers and extracts the language', () => {
    expect(parseSubtitleFilename('Movie.en.forced.srt')).toEqual({
      baseName: 'Movie',
      language: 'en',
      format: 'srt'
    })

    expect(parseSubtitleFilename('Movie.en.sdh.srt')).toEqual({
      baseName: 'Movie',
      language: 'en',
      format: 'srt'
    })
  })

  it('handles TV episode style filenames', () => {
    expect(parseSubtitleFilename('Show.S01E02.en.srt')).toEqual({
      baseName: 'Show.S01E02',
      language: 'en',
      format: 'srt'
    })
  })

  it('handles uppercase extensions and language codes', () => {
    expect(parseSubtitleFilename('Movie.EN.SRT')).toEqual({
      baseName: 'Movie',
      language: 'en',
      format: 'srt'
    })
  })

  it('returns null for non-subtitle extensions', () => {
    expect(parseSubtitleFilename('Movie.en.mp4')).toBeNull()
    expect(parseSubtitleFilename('Movie.txt')).toBeNull()
  })
})
