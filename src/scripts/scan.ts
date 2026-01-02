import { config } from 'dotenv'

import { scanLibrary } from '../services/scanner'

config()

const libraryPath = process.argv[2] || 'D:\\Downloads\\Movies'

async function main() {
  console.log('Movie Library Scanner')
  console.log('=====================')
  console.log()

  const startTime = Date.now()

  try {
    const result = await scanLibrary(libraryPath)

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log()
    console.log('Scan Complete!')
    console.log('==============')
    console.log(`Total files found: ${result.total}`)
    console.log(`New movies added:  ${result.added}`)
    console.log(`Movies updated:    ${result.updated}`)
    console.log(`Time elapsed:      ${duration}s`)
  } catch (error) {
    console.error('Scan failed:', error)
    process.exit(1)
  }
}

main()
