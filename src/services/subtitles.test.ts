// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  convertSrtToVtt,
  discoverSubtitlesForVideo,
  languageDisplayName,
  readSubtitleSiblings
} from './subtitles'

describe('languageDisplayName', () => {
  it('returns the English name for known codes', () => {
    expect(languageDisplayName('en')).toBe('English')
    expect(languageDisplayName('es')).toBe('Spanish')
    expect(languageDisplayName('ja')).toBe('Japanese')
  })

  it('falls back to a friendly label for unknown codes', () => {
    expect(languageDisplayName('zz')).toBe('zz')
  })

  it('returns "Unknown" for the undetermined sentinel', () => {
    expect(languageDisplayName('und')).toBe('Unknown')
  })
})

describe('convertSrtToVtt', () => {
  it('prefixes a WEBVTT header and rewrites comma timestamps', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,000',
      'Hello, world!',
      '',
      '2',
      '00:00:05,500 --> 00:00:07,250',
      'Second cue.',
      ''
    ].join('\n')

    const vtt = convertSrtToVtt(srt)

    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000')
    expect(vtt).toContain('00:00:05.500 --> 00:00:07.250')
    expect(vtt).toContain('Hello, world!')
    expect(vtt).toContain('Second cue.')
  })

  it('strips a UTF-8 BOM from the start of the file', () => {
    const srtWithBom =
      '\uFEFF1\n00:00:01,000 --> 00:00:02,000\nHi\n'

    const vtt = convertSrtToVtt(srtWithBom)

    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(vtt).not.toContain('\uFEFF')
  })

  it('normalizes CRLF line endings to LF', () => {
    const srtCrlf = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n\r\n'

    const vtt = convertSrtToVtt(srtCrlf)

    expect(vtt).not.toContain('\r')
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000')
  })
})

describe('readSubtitleSiblings & discoverSubtitlesForVideo', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'jukebox-subs-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('matches sibling subtitles by base name', async () => {
    const videoPath = join(directory, 'Movie.2020.1080p.mp4')

    await writeFile(videoPath, '')
    await writeFile(join(directory, 'Movie.2020.1080p.en.srt'), '')
    await writeFile(join(directory, 'Movie.2020.1080p.es.srt'), '')

    const entries = await readSubtitleSiblings(directory)
    const subtitles = discoverSubtitlesForVideo(videoPath, entries)

    expect(subtitles).toEqual([
      {
        filePath: join(directory, 'Movie.2020.1080p.en.srt'),
        format: 'srt',
        language: 'en'
      },
      {
        filePath: join(directory, 'Movie.2020.1080p.es.srt'),
        format: 'srt',
        language: 'es'
      }
    ])
  })

  it('matches a subtitle with no language suffix', async () => {
    const videoPath = join(directory, 'Solo.mkv')

    await writeFile(videoPath, '')
    await writeFile(join(directory, 'Solo.srt'), '')

    const entries = await readSubtitleSiblings(directory)
    const subtitles = discoverSubtitlesForVideo(videoPath, entries)

    expect(subtitles).toEqual([
      {
        filePath: join(directory, 'Solo.srt'),
        format: 'srt',
        language: 'und'
      }
    ])
  })

  it('ignores subtitles whose base name does not match the video', async () => {
    const videoPath = join(directory, 'Movie.A.mkv')

    await writeFile(videoPath, '')
    await writeFile(join(directory, 'Movie.A.en.srt'), '')
    await writeFile(join(directory, 'Movie.B.en.srt'), '')

    const entries = await readSubtitleSiblings(directory)
    const subtitles = discoverSubtitlesForVideo(videoPath, entries)

    expect(subtitles.map((subtitle) => subtitle.filePath)).toEqual([
      join(directory, 'Movie.A.en.srt')
    ])
  })

  it('picks up .vtt and .ass files alongside .srt', async () => {
    const videoPath = join(directory, 'Movie.mkv')

    await writeFile(videoPath, '')
    await writeFile(join(directory, 'Movie.en.srt'), '')
    await writeFile(join(directory, 'Movie.fr.vtt'), '')
    await writeFile(join(directory, 'Movie.ja.ass'), '')

    const entries = await readSubtitleSiblings(directory)
    const subtitles = discoverSubtitlesForVideo(videoPath, entries)

    expect(subtitles).toEqual([
      {
        filePath: join(directory, 'Movie.en.srt'),
        format: 'srt',
        language: 'en'
      },
      {
        filePath: join(directory, 'Movie.fr.vtt'),
        format: 'vtt',
        language: 'fr'
      },
      {
        filePath: join(directory, 'Movie.ja.ass'),
        format: 'ass',
        language: 'ja'
      }
    ])
  })

  it('returns an empty list when no siblings match', async () => {
    const videoPath = join(directory, 'Lonely.mkv')

    await writeFile(videoPath, '')

    const entries = await readSubtitleSiblings(directory)
    const subtitles = discoverSubtitlesForVideo(videoPath, entries)

    expect(subtitles).toEqual([])
  })
})
