import { Effect, Layer } from 'effect'

import { db, schema } from '../database'
import { DatabaseLive } from '../database/layer'
import { Scanner } from '../services/scanner'
import { ShowScanner } from '../services/show-scanner'

const args = process.argv.slice(2)
const showsFlagIndex = args.indexOf('--shows')
let moviePath: string | null = null
let showsPath: string | null = null

if (showsFlagIndex !== -1) {
  showsPath = args[showsFlagIndex + 1] ?? null
  const nonFlagArgs = args.filter(
    (_, index) => index !== showsFlagIndex && index !== showsFlagIndex + 1
  )
  moviePath = nonFlagArgs[0] ?? null
} else if (args.length > 0) {
  moviePath = args[0] ?? null
}

const program = Effect.gen(function* () {
  const scanner = yield* Scanner
  const showScanner = yield* ShowScanner

  const scanFromLibraries = Effect.gen(function* () {
    const libraries = yield* Effect.promise(() =>
      db.select().from(schema.libraries)
    )

    if (libraries.length === 0) {
      console.log(
        'No libraries configured. Run the setup at http://localhost:1990/setup'
      )

      return
    }

    for (const library of libraries) {
      if (library.type === 'movies') {
        console.log(`Scanning movies library "${library.name}"...`)

        const result = yield* scanner.scanLibrary(library.path)

        console.log(`  Total files found: ${result.total}`)
        console.log(`  New movies added:  ${result.added}`)
        console.log(`  Movies updated:    ${result.updated}`)
      } else {
        console.log(`Scanning shows library "${library.name}"...`)

        const result = yield* showScanner.scanShowLibrary(library.path)

        console.log(`  Total episodes found: ${result.total}`)
        console.log(`  New episodes added:   ${result.added}`)
        console.log(`  Episodes updated:     ${result.updated}`)
      }

      console.log()
    }
  })

  console.log('Jukebox Library Scanner')
  console.log('=======================')
  console.log()

  const startTime = Date.now()

  // If no CLI args provided, read from configured libraries.
  if (!moviePath && !showsPath) {
    yield* scanFromLibraries
  } else {
    if (moviePath) {
      console.log('Scanning movies...')

      const movieResult = yield* scanner.scanLibrary(moviePath)

      console.log()
      console.log('Movies:')
      console.log(`  Total files found: ${movieResult.total}`)
      console.log(`  New movies added:  ${movieResult.added}`)
      console.log(`  Movies updated:    ${movieResult.updated}`)
    }

    if (showsPath) {
      console.log()
      console.log('Scanning shows...')

      const showResult = yield* showScanner.scanShowLibrary(showsPath)

      console.log()
      console.log('Shows:')
      console.log(`  Total episodes found: ${showResult.total}`)
      console.log(`  New episodes added:   ${showResult.added}`)
      console.log(`  Episodes updated:     ${showResult.updated}`)
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`Scan complete! Time elapsed: ${duration}s`)
})

const scanLayer = Layer.mergeAll(Scanner.Default, ShowScanner.Default).pipe(
  Layer.provide(DatabaseLive)
)

Effect.runPromise(program.pipe(Effect.provide(scanLayer))).catch(
  (error: unknown) => {
    console.error('Scan failed:', error)
    process.exit(1)
  }
)
