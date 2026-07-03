// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  defaultLibraryName,
  libraryUnreadableMessage,
  pathIsReadable,
  readLibraryRoot,
  validateLibraryInput
} from './library-validation'

let temporaryDirectory: string

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'jukebox-validation-'))
})

afterEach(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true })
})

describe('defaultLibraryName', () => {
  it('uses the last path segment', () => {
    expect(defaultLibraryName('D:\\Media\\Shows', 'shows')).toEqual('Shows')
    expect(defaultLibraryName('/mnt/media/movies', 'movies')).toEqual('movies')
  })

  it('ignores trailing separators', () => {
    expect(defaultLibraryName('D:\\Media\\Shows\\', 'shows')).toEqual('Shows')
    expect(defaultLibraryName('/mnt/media/movies/', 'movies')).toEqual(
      'movies'
    )
  })

  it('falls back to the type when the path has no segments', () => {
    expect(defaultLibraryName('/', 'movies')).toEqual('movies')
    expect(defaultLibraryName('\\', 'shows')).toEqual('shows')
  })
})

describe('validateLibraryInput', () => {
  it('accepts a valid entry and trims fields', () => {
    expect(
      validateLibraryInput({ name: ' My Shows ', path: ' /media/shows ', type: 'shows' })
    ).toEqual({ name: 'My Shows', path: '/media/shows', type: 'shows' })
  })

  it('rejects non-objects', () => {
    expect(validateLibraryInput(null)).toEqual(
      'Library entry must be an object.'
    )
    expect(validateLibraryInput('nope')).toEqual(
      'Library entry must be an object.'
    )
  })

  it('rejects a blank path', () => {
    expect(validateLibraryInput({ path: '  ', type: 'movies' })).toEqual(
      'Library path is required.'
    )
  })

  it('rejects an unknown type', () => {
    expect(validateLibraryInput({ path: '/media', type: 'music' })).toEqual(
      'Library type must be "movies" or "shows".'
    )
  })
})

describe('pathIsReadable', () => {
  it('returns true for an existing directory', async () => {
    expect(await pathIsReadable(temporaryDirectory)).toEqual(true)
  })

  it('returns false for a missing directory', async () => {
    expect(await pathIsReadable(join(temporaryDirectory, 'missing'))).toEqual(
      false
    )
  })
})

describe('readLibraryRoot', () => {
  it('returns the entries of a readable directory', async () => {
    await writeFile(join(temporaryDirectory, 'a.mkv'), '')

    expect(await readLibraryRoot(temporaryDirectory)).toEqual(['a.mkv'])
  })

  it('throws an actionable error for a missing directory', async () => {
    const missing = join(temporaryDirectory, 'missing')

    await expect(readLibraryRoot(missing)).rejects.toThrow(
      libraryUnreadableMessage(missing)
    )
  })

  it('throws an actionable error when the path is a file', async () => {
    const filePath = join(temporaryDirectory, 'file.txt')
    await writeFile(filePath, '')

    await expect(readLibraryRoot(filePath)).rejects.toThrow(
      libraryUnreadableMessage(filePath)
    )
  })
})
