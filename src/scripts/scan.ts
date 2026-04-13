import { db, schema } from '../database'
import { scanLibrary } from '../services/scanner'
import { scanShowLibrary } from '../services/show-scanner'

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

async function scanFromLibraries() {
  const libraries = await db.select().from(schema.libraries)

  if (libraries.length === 0) {
    console.log('No libraries configured. Run the setup at http://localhost:1990/setup')

    return
  }

  for (const library of libraries) {
    if (library.type === 'movies') {
      console.log(`Scanning movies library "${library.name}"...`)
      const result = await scanLibrary(library.path)
      console.log(`  Total files found: ${result.total}`)
      console.log(`  New movies added:  ${result.added}`)
      console.log(`  Movies updated:    ${result.updated}`)
    } else {
      console.log(`Scanning shows library "${library.name}"...`)
      const result = await scanShowLibrary(library.path)
      console.log(`  Total episodes found: ${result.total}`)
      console.log(`  New episodes added:   ${result.added}`)
      console.log(`  Episodes updated:     ${result.updated}`)
    }

    console.log()
  }
}

async function main() {
  console.log('Jukebox Library Scanner')
  console.log('=======================')
  console.log()

  const startTime = Date.now()

  try {
    // If no CLI args provided, read from configured libraries
    if (!moviePath && !showsPath) {
      await scanFromLibraries()
    } else {
      if (moviePath) {
        console.log('Scanning movies...')
        const movieResult = await scanLibrary(moviePath)
        console.log()
        console.log('Movies:')
        console.log(`  Total files found: ${movieResult.total}`)
        console.log(`  New movies added:  ${movieResult.added}`)
        console.log(`  Movies updated:    ${movieResult.updated}`)
      }

      if (showsPath) {
        console.log()
        console.log('Scanning shows...')
        const showResult = await scanShowLibrary(showsPath)
        console.log()
        console.log('Shows:')
        console.log(`  Total episodes found: ${showResult.total}`)
        console.log(`  New episodes added:   ${showResult.added}`)
        console.log(`  Episodes updated:     ${showResult.updated}`)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`Scan complete! Time elapsed: ${duration}s`)
  } catch (error) {
    console.error('Scan failed:', error)
    process.exit(1)
  }
}

void main()
