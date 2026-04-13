import { mkdirSync, readFileSync } from 'fs'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface JukeboxConfig {
  tmdbApiKey: string
}

export const configDirectory = join(homedir(), '.jukebox')
export const configFilePath = join(configDirectory, 'config.json')
export const databasePath = join(configDirectory, 'jukebox.db')

export function ensureConfigDirectory(): void {
  mkdirSync(configDirectory, { recursive: true })
}

export function getConfig(): JukeboxConfig | null {
  if (!existsSync(configFilePath)) {
    return null
  }

  try {
    const raw = readFileSync(configFilePath, 'utf-8')

    return JSON.parse(raw) as JukeboxConfig
  } catch {
    return null
  }
}

export async function saveConfig(config: JukeboxConfig): Promise<void> {
  ensureConfigDirectory()
  await Bun.write(configFilePath, JSON.stringify(config, null, 2))
}
