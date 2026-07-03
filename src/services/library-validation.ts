import { constants } from 'fs'
import { access, readdir } from 'fs/promises'

export interface LibraryInput {
  name: string
  path: string
  type: 'movies' | 'shows'
}

export function defaultLibraryName(path: string, type: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? type
}

export function libraryUnreadableMessage(libraryPath: string): string {
  return `Can't read library folder ${libraryPath} — it doesn't exist or Jukebox doesn't have permission. Fix the path in Settings → Libraries, then run the scan again.`
}

export async function pathIsReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)

    return true
  } catch {
    return false
  }
}

/**
 * Read the top-level entries of a library root. Unlike reads of nested
 * folders (which scanners tolerate failing), an unreadable root means the
 * whole library is misconfigured, so this throws an actionable error that
 * surfaces to the user as a library scan error.
 */
export async function readLibraryRoot(libraryPath: string): Promise<string[]> {
  try {
    return await readdir(libraryPath)
  } catch {
    throw new Error(libraryUnreadableMessage(libraryPath))
  }
}

export function validateLibraryInput(input: unknown): LibraryInput | string {
  if (typeof input !== 'object' || input === null) {
    return 'Library entry must be an object.'
  }

  const record = input as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const libraryPath = typeof record.path === 'string' ? record.path.trim() : ''
  const type = record.type

  if (libraryPath.length === 0) {
    return 'Library path is required.'
  }

  if (type !== 'movies' && type !== 'shows') {
    return 'Library type must be "movies" or "shows".'
  }

  return { name, path: libraryPath, type }
}
