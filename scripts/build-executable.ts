import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'fs'
import { execFileSync, execSync, spawn } from 'child_process'
import { tmpdir } from 'os'
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
  // `npx vite build` (matching scripts/build.ts) instead of a nested
  // `bun run` — nested bun invocations fail on some setups.
  run('npx vite build')
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

  const version = readProjectVersion()

  // Bun substitutes `process.env.NODE_ENV` at build time. Without this define
  // the compiled binary boots with `NODE_ENV=development`, which triggers the
  // dev-only `await import('vite')` path and crashes at startup.
  //
  // execFileSync with an argument array (no shell) so the quotes inside the
  // define values survive on every platform — cmd.exe does not treat single
  // quotes as quoting, which corrupted these flags on Windows.
  const args = [
    'build',
    '--compile',
    `--target=${resolvedConfiguration.bunTarget}`,
    ...externalModules.flatMap((moduleName) => ['--external', moduleName]),
    '--define',
    `JUKEBOX_BUILD_VERSION=${JSON.stringify(version)}`,
    '--define',
    'process.env.NODE_ENV="production"',
    'src/index.ts',
    '--outfile',
    binaryPath
  ]

  console.log(`> bun ${args.join(' ')}`)

  execFileSync('bun', args, { cwd: projectRoot, stdio: 'inherit' })
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

function hostTarget(): string {
  const platform = process.platform === 'win32' ? 'windows' : process.platform

  return `${platform}-${process.arch}`
}

// Boot the compiled binary against a throwaway home directory and hit it
// over HTTP. `bun build --compile` failures like the 0.5.2 release (a
// runtime module missing from the bundle) only surface when the binary
// actually boots, so this is the regression guard for them.
async function smokeTestExecutable(): Promise<void> {
  if (target !== hostTarget()) {
    console.log(
      `\nSkipping smoke test: target ${target} does not match host ${hostTarget()}.`
    )

    return
  }

  console.log('\nSmoke testing the compiled executable...')

  const temporaryHome = mkdtempSync(join(tmpdir(), 'jukebox-smoke-'))
  const port = 21990

  const child = spawn(binaryPath, [], {
    cwd: stagingDirectory,
    env: {
      ...process.env,
      HOME: temporaryHome,
      PORT: String(port),
      USERPROFILE: temporaryHome
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let childOutput = ''
  let childExited = false

  child.stdout?.on('data', (chunk: Buffer) => {
    childOutput += chunk.toString()
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    childOutput += chunk.toString()
  })
  child.on('exit', () => {
    childExited = true
  })

  const requestOk = async (path: string): Promise<boolean> => {
    try {
      const response = await fetch(`http://localhost:${port}${path}`)

      return response.ok
    } catch {
      return false
    }
  }

  try {
    const deadline = Date.now() + 30_000
    let reachable = false

    while (Date.now() < deadline) {
      if (childExited) {
        break
      }

      reachable = await requestOk('/api')

      if (reachable) {
        break
      }

      await new Promise((resolvePause) => setTimeout(resolvePause, 500))
    }

    invariant(
      reachable,
      `The compiled executable did not answer on /api within 30s${
        childExited ? ' (the process exited)' : ''
      }. Output:\n${childOutput}`
    )

    const rootOk = await requestOk('/')

    invariant(
      rootOk,
      `The compiled executable did not serve the client on /. Output:\n${childOutput}`
    )

    console.log('Smoke test passed: /api and / answered 200.')
  } finally {
    child.kill()
    rmSync(temporaryHome, { recursive: true, force: true })
  }
}

ensureStagingDirectory()
buildClient()
compileExecutable()
copySupportingAssets()
await smokeTestExecutable()

console.log(`\nExecutable bundle staged at ${stagingDirectory}`)
console.log(`Binary: ${binaryPath}`)
