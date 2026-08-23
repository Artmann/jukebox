// @vitest-environment node

// Integration tests for the seek-restart conversion path against a real
// (ffmpeg-generated) file. The regression they guard: Mediabunny's
// Conversion refuses to stream-copy video when trim.start is past the first
// packet — it silently forces a full video re-encode, which fails outright on
// machines whose hardware encoder node-av can't open. The trimmed-copy path
// must therefore start mid-file WITHOUT re-encoding video, beginning at the
// keyframe at-or-before the requested position.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createVideoFixture } from './test-video-fixture'
import { findSeekStart, runMediabunnyConversion } from './transcoder'

let fixtureDirectory = ''
let fixturePath = ''

const tempDirectories: string[] = []

function makeTempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'jukebox-conversion-test-'))

  tempDirectories.push(directory)

  return directory
}

function playlistSeconds(playlist: string): number {
  let total = 0

  for (const match of playlist.matchAll(/#EXTINF:([\d.]+)/g)) {
    total += Number(match[1])
  }

  return total
}

beforeAll(() => {
  const fixture = createVideoFixture()

  fixtureDirectory = fixture.directory
  fixturePath = fixture.filePath
})

afterAll(() => {
  rmSync(fixtureDirectory, { force: true, recursive: true })

  for (const directory of tempDirectories) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('findSeekStart', () => {
  it('snaps the target to the keyframe at or before it', async () => {
    // Keyframes sit at 0, 2, 4, ... — a seek to 5 starts at 4.
    const startSeconds = await findSeekStart(fixturePath, 5)

    expect(startSeconds).toBeCloseTo(4, 1)
  })

  it('falls back to 0 for a target before the first keyframe', async () => {
    const startSeconds = await findSeekStart(fixturePath, 0.05)

    expect(startSeconds).toEqual(0)
  })
})

describe('runMediabunnyConversion', () => {
  it('converts from the start and finalizes the playlist', async () => {
    const tempDir = makeTempDir()

    await runMediabunnyConversion({
      filePath: fixturePath,
      startSeconds: 0,
      tempDir
    }).promise

    const playlist = readFileSync(path.join(tempDir, 'media.m3u8'), 'utf8')

    expect(playlist).toContain('#EXT-X-ENDLIST')
    expect(playlistSeconds(playlist)).toBeCloseTo(12, 0)
  }, 60_000)

  it('starts mid-file at the snapped keyframe without re-encoding video', async () => {
    const tempDir = makeTempDir()
    const startSeconds = await findSeekStart(fixturePath, 5)

    await runMediabunnyConversion({
      filePath: fixturePath,
      startSeconds,
      tempDir
    }).promise

    const playlist = readFileSync(path.join(tempDir, 'media.m3u8'), 'utf8')
    const segments = readdirSync(tempDir).filter((name) =>
      /^segment-\d+\.ts$/.test(name)
    )

    expect(playlist).toContain('#EXT-X-ENDLIST')
    expect(segments.length).toBeGreaterThan(0)

    // 12 seconds of video minus the 4-second keyframe start. A re-encode at
    // the exact requested position (the old, broken behaviour) would produce
    // 7 seconds instead.
    expect(playlistSeconds(playlist)).toBeCloseTo(8, 0)
  }, 60_000)

  it('can be canceled mid-conversion without rejecting', async () => {
    const tempDir = makeTempDir()

    const handle = runMediabunnyConversion({
      filePath: fixturePath,
      startSeconds: 4,
      tempDir
    })

    await handle.cancel()
    await handle.promise
  }, 60_000)
})
