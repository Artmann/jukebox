import { describe, expect, it } from 'vitest'
import { normalizeShowName } from './show-scanner'

describe('normalizeShowName', () => {
  it('strips season info and quality tags', () => {
    expect(normalizeShowName('Silicon Valley Season 4 Complete 720p HDTV x264 [i_c]')).toEqual({ name: 'Silicon Valley', year: null })
  })

  it('strips dot-separated season and quality info', () => {
    expect(normalizeShowName('Silicon.Valley.S01.720p.BRRip.MkvCage')).toEqual({ name: 'Silicon Valley', year: null })
  })

  it('strips season range notation', () => {
    expect(normalizeShowName('Silicon.Valley.Season.2.S02.720p.x265.HEVC.Complete[fs87]')).toEqual({ name: 'Silicon Valley', year: null })
  })

  it('extracts year from show folder name', () => {
    expect(normalizeShowName('First Wave 1998 Season 1 Complete TVRip x264 [i_c]')).toEqual({ name: 'First Wave', year: 1998 })
  })

  it('groups multi-season First Wave folders', () => {
    const season1 = normalizeShowName('First Wave 1998 Season 1 Complete TVRip x264 [i_c]')
    const season2 = normalizeShowName('First Wave 1998 Season 2 Complete TVRip x264 [i_c]')
    const season3 = normalizeShowName('First Wave 1998 Season 3 Complete TVRip x264 [i_c]')
    expect(season1.name).toEqual(season2.name)
    expect(season2.name).toEqual(season3.name)
  })

  it('handles parenthetical year and season range', () => {
    expect(normalizeShowName('Charmed (1998) Season 1-8 S01-S08 (1080p BluRay x265 HEVC 10bit AAC 2.0 Silence)')).toEqual({ name: 'Charmed', year: 1998 })
  })

  it('handles complete series in folder name', () => {
    expect(normalizeShowName('Buffy The Vampire Slayer Complete Series DVDRip 576p x264 (MKV)')).toEqual({ name: 'Buffy The Vampire Slayer', year: null })
  })

  it('handles simple folder names', () => {
    expect(normalizeShowName('Relic Hunter')).toEqual({ name: 'Relic Hunter', year: null })
  })

  it('handles folder with seasons prefix', () => {
    expect(normalizeShowName('Doctor Who Seasons 1 to 13 Mp4 1080p')).toEqual({ name: 'Doctor Who', year: null })
  })

  it('handles HOUSE of LIES style', () => {
    expect(normalizeShowName('HOUSE of LIES - Complete TV Series (S01-S05) - 720p HDTV x264')).toEqual({ name: 'HOUSE of LIES', year: null })
  })

  it('handles Top Chef with year and season', () => {
    expect(normalizeShowName('Top Chef 2006 Season 20 Complete 720p WEB x264 [i_c]')).toEqual({ name: 'Top Chef', year: 2006 })
  })
})
