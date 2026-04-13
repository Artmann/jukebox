import { rmSync } from 'fs'
import { execSync } from 'child_process'

const run = (command: string) => {
  console.log(`> ${command}`)
  execSync(command, { stdio: 'inherit' })
}

console.log('Cleaning dist/...')
rmSync('dist', { recursive: true, force: true })

console.log('\nBuilding client...')
run('npx vite build')

console.log('\nBuilding server...')
run('npx rolldown -c rolldown.config.ts')

console.log('\nBuild complete.')
