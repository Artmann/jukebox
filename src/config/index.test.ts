import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'path'

import {
  configDirectory,
  configFilePath,
  databasePath,
  ensureConfigDirectory
} from './index'

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  const mock = { ...actual, homedir: () => '/home/testuser' }

  return { ...mock, default: mock }
})

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const mock = {
    ...actual,
    mkdirSync: vi.fn()
  }

  return { ...mock, default: mock }
})

import { mkdirSync } from 'fs'

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets configDirectory to ~/.jukebox', () => {
    expect(configDirectory).toEqual(join('/home/testuser', '.jukebox'))
  })

  it('sets databasePath inside config directory', () => {
    expect(databasePath).toEqual(join(configDirectory, 'jukebox.db'))
  })

  it('sets configFilePath inside config directory', () => {
    expect(configFilePath).toEqual(join(configDirectory, 'config.json'))
  })

  describe('ensureConfigDirectory', () => {
    it('creates the config directory recursively', () => {
      ensureConfigDirectory()

      expect(mkdirSync).toHaveBeenCalledWith(configDirectory, {
        recursive: true
      })
    })
  })
})
