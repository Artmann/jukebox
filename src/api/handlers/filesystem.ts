import { constants } from 'fs'
import { access, readdir } from 'fs/promises'
import { homedir } from 'os'
import path from 'path'

import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'

import { jukeboxApi } from '../contract'
import {
  BadRequest,
  Forbidden,
  InternalError,
  NotFound
} from '../contract/errors'
import type { BrowseEntry, BrowseResponse } from '../contract/schemas'

import { withInternalFallback } from './support'

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
    process.platform === 'win32' ? await listWindowsDrives() : listPosixRoots()

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
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

  const parent = isAtFilesystemRoot(resolved) ? null : path.dirname(resolved)

  return {
    entries,
    parent,
    path: resolved,
    separator: path.sep
  }
}

function browseError(
  caught: unknown,
  trimmed: string
): BadRequest | Forbidden | InternalError | NotFound {
  const code =
    caught && typeof caught === 'object' && 'code' in caught
      ? String((caught as { code: unknown }).code)
      : 'unknown'

  if (code === 'ENOENT') {
    return new NotFound({
      message: `Folder doesn't exist: ${trimmed}. Check the path and try again.`
    })
  }

  if (code === 'EACCES' || code === 'EPERM') {
    return new Forbidden({
      message: `Jukebox doesn't have permission to read ${trimmed}. Check the server's file permissions.`
    })
  }

  if (code === 'ENOTDIR') {
    return new BadRequest({
      message: `${trimmed} is a file, not a folder. Pick a folder instead.`
    })
  }

  return new InternalError({ message: `Couldn't list ${trimmed}: ${code}.` })
}

// Ports src/api/routes/filesystem.ts.
export const filesystemHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'filesystem',
  (handlers) =>
    handlers.handle('browse', ({ urlParams }) =>
      withInternalFallback(
        Effect.gen(function* () {
          const rawPath = urlParams.path
          const trimmed = typeof rawPath === 'string' ? rawPath.trim() : ''

          if (trimmed.length === 0) {
            return yield* Effect.promise(() => listRoots())
          }

          return yield* Effect.tryPromise({
            catch: (caught) => browseError(caught, trimmed),
            try: () => listDirectory(trimmed)
          })
        })
      )
    )
)
