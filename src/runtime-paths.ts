import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Bun's compiled executables have used several virtual filesystem markers
// over time: `/$bunfs/` on older versions, and a `B:/~BUN/` drive on modern
// Windows builds — where the tilde arrives percent-encoded (`%7EBUN`) via
// `import.meta.url`. Match all of them, case-insensitively.
const virtualFileSystemMarkers = ['/$bunfs/', '/~bun/', '/%7ebun/']

export function isCompiledExecutable(
  moduleUrl: string = import.meta.url
): boolean {
  if (moduleUrl.startsWith('compiled://')) {
    return true
  }

  const normalizedUrl = moduleUrl.toLowerCase()

  return virtualFileSystemMarkers.some((marker) =>
    normalizedUrl.includes(marker)
  )
}

function resolveBinaryDirectory(): string {
  const executablePath = process.execPath

  return path.dirname(executablePath)
}

// The application root is the directory that contains the bundled assets that
// ship alongside the server — `dist/client/`, `drizzle/`, and `package.json`.
// In a normal `bun run start` / `node dist/server/index.js` run we resolve it
// relative to this source file's location. Inside a `bun build --compile`
// executable, `import.meta.url` points at a virtual `$bunfs` path that does
// not exist on disk, so we anchor the lookup at the binary's directory
// instead — that is where the release archive places the support files.
export function getApplicationRoot(): string {
  if (isCompiledExecutable()) {
    return resolveBinaryDirectory()
  }

  const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

  // `src/runtime-paths.ts` → project root is one level up. After the rolldown
  // build the file lives at `dist/server/runtime-paths.js`, where the project
  // root is two levels up.
  const sourceRelativeRoot = path.resolve(currentDirectory, '..')
  const bundleRelativeRoot = path.resolve(currentDirectory, '../..')

  if (looksLikeApplicationRoot(sourceRelativeRoot)) {
    return sourceRelativeRoot
  }

  if (looksLikeApplicationRoot(bundleRelativeRoot)) {
    return bundleRelativeRoot
  }

  return sourceRelativeRoot
}

function looksLikeApplicationRoot(directory: string): boolean {
  try {
    const packageJsonPath = path.join(directory, 'package.json')

    if (!existsSync(packageJsonPath)) {
      return false
    }

    const contents = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      name?: string
    }

    return contents.name === 'jukebox-media-server'
  } catch {
    return false
  }
}

export function getClientAssetsDirectory(): string {
  return path.join(getApplicationRoot(), 'dist', 'client')
}

export function getMigrationsDirectory(): string {
  return path.join(getApplicationRoot(), 'drizzle')
}

export function getPackageJsonPath(): string {
  return path.join(getApplicationRoot(), 'package.json')
}
