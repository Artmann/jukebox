import { describe, expect, it } from 'vitest'

import { isCompiledExecutable } from './runtime-paths'

describe('isCompiledExecutable', () => {
  it('detects the legacy bunfs virtual path', () => {
    expect(isCompiledExecutable('file:///$bunfs/root/jukebox-media-server')).toEqual(true)
  })

  it('detects the compiled protocol', () => {
    expect(isCompiledExecutable('compiled://root/jukebox-media-server')).toEqual(true)
  })

  it('detects the modern Windows bunfs drive with percent-encoded tilde', () => {
    expect(
      isCompiledExecutable('file:///B:/%7EBUN/root/jukebox-media-server.exe')
    ).toEqual(true)
  })

  it('detects the modern Windows bunfs drive with a raw tilde', () => {
    expect(
      isCompiledExecutable('file:///B:/~BUN/root/jukebox-media-server.exe')
    ).toEqual(true)
  })

  it('treats regular source files as not compiled', () => {
    expect(
      isCompiledExecutable('file:///C:/Users/dev/jukebox/src/runtime-paths.ts')
    ).toEqual(false)
  })

  it('treats regular posix source files as not compiled', () => {
    expect(
      isCompiledExecutable('file:///home/dev/jukebox/src/runtime-paths.ts')
    ).toEqual(false)
  })
})
