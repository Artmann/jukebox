import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export const configDirectory = join(homedir(), '.jukebox')
export const configFilePath = join(configDirectory, 'config.json')
export const databasePath = join(configDirectory, 'jukebox.db')

export function ensureConfigDirectory(): void {
  mkdirSync(configDirectory, { recursive: true })
}
