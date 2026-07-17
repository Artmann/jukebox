// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  _clearSessions,
  _listSessionKeys,
  type ConversionHandle,
  startTranscode,
  waitForPlaylistContent
} from './transcoder'

function pendingConversion(): ConversionHandle {
  return {
    cancel: vi.fn(async () => {}),
    promise: new Promise(() => {})
  }
}

afterEach(() => {
  _clearSessions()
})

describe('startTranscode', () => {
  it('starts a Mediabunny conversion for the requested file', () => {
    const runConversion = vi.fn(pendingConversion)

    const session = startTranscode({
      fileId: 'movie-1',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      runConversion
    })

    expect(runConversion).toHaveBeenCalledTimes(1)
    expect(runConversion).toHaveBeenCalledWith({
      filePath: '/tmp/sample.mkv',
      tempDir: session.tempDir
    })

    expect(session.tempDir.length).toBeGreaterThan(0)
    expect(session.playlistPath).toEqual(
      path.join(session.tempDir, 'index.m3u8')
    )
  })

  it('reuses the same session when called again with the same fileId + profileId', () => {
    const runConversion = vi.fn(pendingConversion)

    const first = startTranscode({
      fileId: 'movie-2',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      runConversion
    })

    const second = startTranscode({
      fileId: 'movie-2',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      runConversion
    })

    expect(second).toEqual(first)
    expect(runConversion).toHaveBeenCalledTimes(1)
    expect(_listSessionKeys()).toEqual(['movie-2:1'])
  })

  it('creates distinct sessions for different profiles on the same file', () => {
    const runConversion = vi.fn(pendingConversion)

    startTranscode({
      fileId: 'movie-3',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      runConversion
    })

    startTranscode({
      fileId: 'movie-3',
      filePath: '/tmp/sample.mkv',
      profileId: 2,
      runConversion
    })

    expect(runConversion).toHaveBeenCalledTimes(2)
    expect(_listSessionKeys().sort()).toEqual(['movie-3:1', 'movie-3:2'])
  })

  it('rejects readyPromise with an actionable error when the conversion fails', async () => {
    const runConversion = vi.fn(() => ({
      cancel: vi.fn(async () => {}),
      promise: Promise.reject(new Error('no decodable audio track'))
    }))

    const session = startTranscode({
      fileId: 'movie-4',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      runConversion
    })

    await expect(session.readyPromise).rejects.toThrow(/ffmpeg is installed/)
  })

  it('resolves readyPromise once the playlist file appears on disk', async () => {
    vi.useFakeTimers()

    try {
      const runConversion = vi.fn(pendingConversion)

      const session = startTranscode({
        fileId: 'movie-5',
        filePath: '/tmp/sample.mkv',
        profileId: 1,
        runConversion
      })

      // Simulate the conversion producing the master playlist.
      writeFileSync(session.playlistPath, '#EXTM3U\n')

      const ready = session.readyPromise

      await vi.advanceTimersByTimeAsync(200)

      await expect(ready).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the conversion when the session is stopped', () => {
    const cancel = vi.fn(async () => {})
    const runConversion = vi.fn(() => ({
      cancel,
      promise: new Promise<void>(() => {})
    }))

    startTranscode({
      fileId: 'movie-6',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      runConversion
    })

    _clearSessions()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(_listSessionKeys()).toEqual([])
  })
})

describe('waitForPlaylistContent', () => {
  let workingDirectory: string

  afterEach(() => {
    rmSync(workingDirectory, { force: true, recursive: true })
  })

  it('resolves immediately when the file already holds valid playlist content', async () => {
    workingDirectory = mkdtempSync(
      path.join(os.tmpdir(), 'jukebox-playlist-test-')
    )

    const playlistPath = path.join(workingDirectory, 'media.m3u8')

    writeFileSync(playlistPath, '#EXTM3U\n#EXT-X-VERSION:3\n')

    const content = await waitForPlaylistContent(playlistPath, 1000, 50)

    expect(content).toEqual('#EXTM3U\n#EXT-X-VERSION:3\n')
  })

  // Regression test: Mediabunny's HLS muxer rewrites media.m3u8 by opening a
  // brand new truncate-mode file handle on every new segment, for the whole
  // lifetime of a live conversion. A reader that only checks the file's
  // existence (the old behavior) can land in that truncate-to-refill window
  // and read an empty file. waitForPlaylistContent must keep polling past an
  // empty/mid-rewrite read until the content is actually a valid playlist.
  it('waits past an empty truncate-then-rewrite window and resolves with the rewritten content', async () => {
    workingDirectory = mkdtempSync(
      path.join(os.tmpdir(), 'jukebox-playlist-test-')
    )

    const playlistPath = path.join(workingDirectory, 'media.m3u8')
    const finalContent = '#EXTM3U\n#EXT-X-VERSION:3\nsegment-1.ts\n'

    writeFileSync(playlistPath, '')

    setTimeout(() => {
      writeFileSync(playlistPath, finalContent)
    }, 150)

    const content = await waitForPlaylistContent(playlistPath, 2000, 50)

    expect(content).toEqual(finalContent)
  })

  it('resolves null after the timeout when the file never settles on valid content', async () => {
    workingDirectory = mkdtempSync(
      path.join(os.tmpdir(), 'jukebox-playlist-test-')
    )

    const playlistPath = path.join(workingDirectory, 'media.m3u8')

    writeFileSync(playlistPath, '')

    const content = await waitForPlaylistContent(playlistPath, 300, 50)

    expect(content).toBeNull()
  })

  it('resolves null after the timeout when the file never appears at all', async () => {
    workingDirectory = mkdtempSync(
      path.join(os.tmpdir(), 'jukebox-playlist-test-')
    )

    const playlistPath = path.join(workingDirectory, 'never-created.m3u8')

    const content = await waitForPlaylistContent(playlistPath, 300, 50)

    expect(content).toBeNull()
  })
})
