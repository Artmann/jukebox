// @vitest-environment node
import { EventEmitter } from 'events'
import { writeFileSync } from 'fs'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  _clearSessions,
  _listSessionKeys,
  startTranscode
} from './transcoder'

interface FakeProcess extends EventEmitter {
  exitCode: number | null
  kill: (signal?: string) => boolean
  stderr: EventEmitter
  stdout: EventEmitter
}

function createFakeProcess(): FakeProcess {
  const proc = new EventEmitter() as FakeProcess

  proc.exitCode = null
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = () => {
    proc.exitCode = 0
    proc.emit('exit', 0)

    return true
  }

  return proc
}

afterEach(() => {
  _clearSessions()
})

describe('startTranscode', () => {
  it('spawns ffmpeg with HLS arguments and copies video while transcoding audio', () => {
    const fakeProcess = createFakeProcess()
    const spawner = vi.fn(() => fakeProcess) as unknown as typeof import('child_process').spawn

    const session = startTranscode({
      fileId: 'movie-1',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      spawnImplementation: spawner
    })

    expect(spawner).toHaveBeenCalledTimes(1)

    const call = (
      spawner as unknown as { mock: { calls: [string, string[]][] } }
    ).mock.calls[0]

    expect(call).toBeDefined()

    const command = call?.[0] ?? ''
    const args = call?.[1] ?? []

    expect(command).toEqual('ffmpeg')
    expect(args).toContain('-c:v')
    expect(args).toContain('copy')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
    expect(args).toContain('-f')
    expect(args).toContain('hls')
    expect(args).toContain('/tmp/sample.mkv')

    expect(session.tempDir.length).toBeGreaterThan(0)
    expect(session.playlistPath).toEqual(path.join(session.tempDir, 'index.m3u8'))
  })

  it('reuses the same session when called again with the same fileId + profileId', () => {
    const fakeProcess = createFakeProcess()
    const spawner = vi.fn(() => fakeProcess) as unknown as typeof import('child_process').spawn

    const first = startTranscode({
      fileId: 'movie-2',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      spawnImplementation: spawner
    })

    const second = startTranscode({
      fileId: 'movie-2',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      spawnImplementation: spawner
    })

    expect(second).toEqual(first)
    expect(spawner).toHaveBeenCalledTimes(1)
    expect(_listSessionKeys()).toEqual(['movie-2:1'])
  })

  it('creates distinct sessions for different profiles on the same file', () => {
    const spawner = vi.fn(() => createFakeProcess()) as unknown as typeof import('child_process').spawn

    startTranscode({
      fileId: 'movie-3',
      filePath: '/tmp/sample.mkv',
      profileId: 1,
      spawnImplementation: spawner
    })

    startTranscode({
      fileId: 'movie-3',
      filePath: '/tmp/sample.mkv',
      profileId: 2,
      spawnImplementation: spawner
    })

    expect(spawner).toHaveBeenCalledTimes(2)
    expect(_listSessionKeys().sort()).toEqual(['movie-3:1', 'movie-3:2'])
  })

  it('throws an actionable error when ffmpeg cannot be spawned', () => {
    const spawner = vi.fn(() => {
      throw new Error('ENOENT')
    }) as unknown as typeof import('child_process').spawn

    expect(() =>
      startTranscode({
        fileId: 'movie-4',
        filePath: '/tmp/sample.mkv',
        profileId: 1,
        spawnImplementation: spawner
      })
    ).toThrow(/ffmpeg is installed/)
  })

  it('resolves readyPromise once the playlist file appears on disk', async () => {
    vi.useFakeTimers()

    try {
      const fakeProcess = createFakeProcess()
      const spawner = vi.fn(() => fakeProcess) as unknown as typeof import('child_process').spawn

      const session = startTranscode({
        fileId: 'movie-5',
        filePath: '/tmp/sample.mkv',
        profileId: 1,
        spawnImplementation: spawner
      })

      // Simulate ffmpeg producing the playlist.
      writeFileSync(session.playlistPath, '#EXTM3U\n')

      const ready = session.readyPromise

      await vi.advanceTimersByTimeAsync(200)

      await expect(ready).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
