import { access } from 'fs/promises'
import { readdir } from 'fs/promises'
import { constants } from 'fs'
import { homedir } from 'os'
import path from 'path'

import { Hono } from 'hono'

interface BrowseEntry {
  name: string
  path: string
}

interface BrowseResponse {
  entries: BrowseEntry[]
  parent: string | null
  path: string
  separator: string
}

async function listWindowsDrives(): Promise<BrowseEntry[]> {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const drives: BrowseEntry[] = []

  await Promise.all(
    letters.map(async (letter) => {
      const drivePath = `${letter}:\\`

      try {
        await access(drivePath, constants.R_OK)
        drives.push({ name: `${letter}:`, path: drivePath })
      } catch {
        // drive isn't there or not readable — skip
      }
    })
  )

  drives.sort((a, b) => a.name.localeCompare(b.name))

  return drives
}

function listPosixRoots(): BrowseEntry[] {
  const entries: BrowseEntry[] = [{ name: '/', path: '/' }]
  const home = homedir()

  if (home && home !== '/') {
    entries.push({ name: `Home (${home})`, path: home })
  }

  return entries
}

async function listRoots(): Promise<BrowseResponse> {
  const entries =
    process.platform === 'win32'
      ? await listWindowsDrives()
      : listPosixRoots()

  return {
    entries,
    parent: null,
    path: '',
    separator: path.sep
  }
}

function isAtFilesystemRoot(resolved: string): boolean {
  const parent = path.dirname(resolved)

  return parent === resolved
}

async function listDirectory(inputPath: string): Promise<BrowseResponse> {
  const resolved = path.resolve(inputPath)
  const dirents = await readdir(resolved, { withFileTypes: true })

  const entries: BrowseEntry[] = dirents
    .flatMap((dirent) =>
      dirent.isDirectory() && !dirent.name.startsWith('.')
        ? [{ name: dirent.name, path: path.join(resolved, dirent.name) }]
        : []
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const parent = isAtFilesystemRoot(resolved) ? null : path.dirname(resolved)

  return {
    entries,
    parent,
    path: resolved,
    separator: path.sep
  }
}

const filesystemRoutes = new Hono()

filesystemRoutes.get('/browse', async (context) => {
  const rawPath = context.req.query('path')
  const trimmed = typeof rawPath === 'string' ? rawPath.trim() : ''

  if (trimmed.length === 0) {
    const response = await listRoots()

    return context.json(response)
  }

  try {
    const response = await listDirectory(trimmed)

    return context.json(response)
  } catch (caught) {
    const code =
      caught && typeof caught === 'object' && 'code' in caught
        ? String((caught as { code: unknown }).code)
        : 'unknown'

    if (code === 'ENOENT') {
      return context.json(
        {
          error: {
            message: `Folder doesn't exist: ${trimmed}. Check the path and try again.`
          }
        },
        404
      )
    }

    if (code === 'EACCES' || code === 'EPERM') {
      return context.json(
        {
          error: {
            message: `Jukebox doesn't have permission to read ${trimmed}. Check the server's file permissions.`
          }
        },
        403
      )
    }

    if (code === 'ENOTDIR') {
      return context.json(
        {
          error: {
            message: `${trimmed} is a file, not a folder. Pick a folder instead.`
          }
        },
        400
      )
    }

    return context.json(
      {
        error: {
          message: `Couldn't list ${trimmed}: ${code}.`
        }
      },
      500
    )
  }
})

export { filesystemRoutes }
export type { BrowseEntry, BrowseResponse }
