import { config } from 'dotenv'

import { scanLibrary } from '../services/scanner'
import { scanShowLibrary } from '../services/show-scanner'

config()

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
} else {
  moviePath = args[0] ?? 'D:\\Downloads\\Movies'
}

async function main() {
  console.log('Jukebox Library Scanner')
  console.log('=======================')
  console.log()

  const startTime = Date.now()

  try {
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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log()
    console.log(`Scan complete! Time elapsed: ${duration}s`)
  } catch (error) {
    console.error('Scan failed:', error)
    process.exit(1)
  }
}

void main()
