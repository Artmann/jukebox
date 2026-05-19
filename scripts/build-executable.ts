import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from 'fs'
import { execSync } from 'child_process'
import { join, resolve } from 'path'

import invariant from 'tiny-invariant'

interface TargetConfiguration {
  archiveSlug: string
  binaryFilename: string
  bunTarget: string
}

const supportedTargets: Record<string, TargetConfiguration> = {
  'darwin-arm64': {
    archiveSlug: 'darwin-arm64',
    binaryFilename: 'jukebox-media-server',
    bunTarget: 'bun-darwin-arm64'
  },
  'darwin-x64': {
    archiveSlug: 'darwin-x64',
    binaryFilename: 'jukebox-media-server',
    bunTarget: 'bun-darwin-x64'
  },
  'linux-arm64': {
    archiveSlug: 'linux-arm64',
    binaryFilename: 'jukebox-media-server',
    bunTarget: 'bun-linux-arm64'
  },
  'linux-x64': {
    archiveSlug: 'linux-x64',
    binaryFilename: 'jukebox-media-server',
    bunTarget: 'bun-linux-x64'
  },
  'windows-x64': {
    archiveSlug: 'windows-x64',
    binaryFilename: 'jukebox-media-server.exe',
    bunTarget: 'bun-windows-x64'
  }
}

const projectRoot = resolve(import.meta.dirname, '..')

const target = process.argv[2] ?? process.env.BUILD_TARGET ?? ''

invariant(
  target.length > 0,
  `No build target specified. Pass one as an argument or via BUILD_TARGET. Supported targets: ${Object.keys(supportedTargets).join(', ')}.`
)

const configuration: TargetConfiguration | undefined = supportedTargets[target]

invariant(
  configuration !== undefined,
  `Unsupported build target "${target}". Supported targets: ${Object.keys(supportedTargets).join(', ')}.`
)

const resolvedConfiguration: TargetConfiguration = configuration

const stagingDirectoryName = `jukebox-media-server-${resolvedConfiguration.archiveSlug}`
const stagingRoot = join(projectRoot, 'release-staging')
const stagingDirectory = join(stagingRoot, stagingDirectoryName)
const binaryPath = join(stagingDirectory, resolvedConfiguration.binaryFilename)

function run(command: string): void {
  console.log(`> ${command}`)

  execSync(command, { cwd: projectRoot, stdio: 'inherit' })
}

function ensureStagingDirectory(): void {
  rmSync(stagingRoot, { recursive: true, force: true })
  mkdirSync(stagingDirectory, { recursive: true })
}

function buildClient(): void {
  console.log('\nBuilding client assets...')
  run('bun run build:client')
}

function readProjectVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(projectRoot, 'package.json'), 'utf-8')
  ) as { version?: string }

  invariant(
    packageJson.version,
    'package.json is missing a version field. Set one before building the executable.'
  )

  return packageJson.version
}

function compileExecutable(): void {
  console.log(
    `\nCompiling executable for ${resolvedConfiguration.bunTarget}...`
  )

  // Vite and its plugins are only loaded in development mode but bun's bundler
  // still walks the dynamic import. Marking them external keeps the compiled
  // binary lean and avoids pulling dev-only dependencies into the runtime.
  const externalModules = ['@tailwindcss/vite', '@vitejs/plugin-react', 'vite']

  const externalFlags = externalModules
    .map((moduleName) => `--external ${moduleName}`)
    .join(' ')

  const version = readProjectVersion()

  // Bun substitutes `process.env.NODE_ENV` at build time. Without this define
  // the compiled binary boots with `NODE_ENV=development`, which triggers the
  // dev-only `await import('vite')` path and crashes at startup.
  const defines = [
    `--define JUKEBOX_BUILD_VERSION='${JSON.stringify(version)}'`,
    `--define process.env.NODE_ENV='"production"'`
  ].join(' ')

  run(
    `bun build --compile --target=${resolvedConfiguration.bunTarget} ${externalFlags} ${defines} src/index.ts --outfile ${binaryPath}`
  )
}

function copySupportingAssets(): void {
  console.log('\nCopying supporting assets...')

  const clientSource = join(projectRoot, 'dist', 'client')

  invariant(
    existsSync(clientSource),
    'dist/client not found. The client build did not produce any output.'
  )

  cpSync(clientSource, join(stagingDirectory, 'dist', 'client'), {
    recursive: true
  })
  cpSync(join(projectRoot, 'drizzle'), join(stagingDirectory, 'drizzle'), {
    recursive: true
  })

  // Skipping package.json on purpose — shipping the full file (with vite and
  // other dev dependencies listed) makes the compiled binary's external module
  // resolver try to load those packages from disk at startup. The version
  // string is injected at compile time via `--define` instead.
  copyFileSync(join(projectRoot, 'LICENSE'), join(stagingDirectory, 'LICENSE'))
  copyFileSync(
    join(projectRoot, 'README.md'),
    join(stagingDirectory, 'README.md')
  )
}

ensureStagingDirectory()
buildClient()
compileExecutable()
copySupportingAssets()

console.log(`\nExecutable bundle staged at ${stagingDirectory}`)
console.log(`Binary: ${binaryPath}`)
