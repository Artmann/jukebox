// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path, { join } from 'path'

import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { filesystemRoutes } from './filesystem'

function buildApp(): Hono {
  const app = new Hono()

  app.route('/', filesystemRoutes)

  return app
}

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'jukebox-fs-'))
})

afterEach(async () => {
  await rm(workDir, { force: true, recursive: true })
})

describe('GET /browse', () => {
  it('returns roots when no path is provided', async () => {
    const app = buildApp()
    const response = await app.request('/browse')
    const body = (await response.json()) as {
      entries: Array<{ name: string; path: string }>
      parent: string | null
      path: string
      separator: string
    }

    expect(response.status).toEqual(200)
    expect(body.parent).toEqual(null)
    expect(body.path).toEqual('')
    expect(body.separator).toEqual(path.sep)
    expect(Array.isArray(body.entries)).toEqual(true)
    expect(body.entries.length).toBeGreaterThan(0)
  })

  it('lists subdirectories and skips files and hidden entries', async () => {
    await mkdir(join(workDir, 'alpha'))
    await mkdir(join(workDir, 'Bravo'))
    await mkdir(join(workDir, '.hidden'))
    await writeFile(join(workDir, 'notes.txt'), 'hi')

    const app = buildApp()
    const response = await app.request(
      `/browse?path=${encodeURIComponent(workDir)}`
    )
    const body = (await response.json()) as {
      entries: Array<{ name: string; path: string }>
      parent: string | null
      path: string
    }

    expect(response.status).toEqual(200)
    expect(body.path).toEqual(path.resolve(workDir))
    expect(body.parent).toEqual(path.dirname(path.resolve(workDir)))
    expect(body.entries).toEqual([
      { name: 'alpha', path: path.join(path.resolve(workDir), 'alpha') },
      { name: 'Bravo', path: path.join(path.resolve(workDir), 'Bravo') }
    ])
  })

  it('returns 404 for a missing folder', async () => {
    const missing = join(workDir, 'does-not-exist')
    const app = buildApp()
    const response = await app.request(
      `/browse?path=${encodeURIComponent(missing)}`
    )
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(404)
    expect(body.error.message).toContain("doesn't exist")
    expect(body.error.message).toContain(missing)
  })

  it('returns 400 when pointed at a file instead of a folder', async () => {
    const filePath = join(workDir, 'notes.txt')

    await writeFile(filePath, 'hi')

    const app = buildApp()
    const response = await app.request(
      `/browse?path=${encodeURIComponent(filePath)}`
    )
    const body = (await response.json()) as { error: { message: string } }

    expect(response.status).toEqual(400)
    expect(body.error.message).toContain('is a file, not a folder')
  })

  it('resolves .. segments to the parent directory', async () => {
    const child = join(workDir, 'child')

    await mkdir(child)

    const traversed = join(child, '..')
    const app = buildApp()
    const response = await app.request(
      `/browse?path=${encodeURIComponent(traversed)}`
    )
    const body = (await response.json()) as { path: string }

    expect(response.status).toEqual(200)
    expect(body.path).toEqual(path.resolve(workDir))
  })
})
