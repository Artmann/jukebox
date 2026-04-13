import { readdir, stat } from 'fs/promises'
import { extname, join } from 'path'

import { parseEpisodeFilename } from './episode-parser'

const videoExtensions = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.flv', '.mpeg', '.mpg'
])

const seasonFolderPattern = /^Season\s+(\d+)/i

export interface NormalizedShow {
  name: string
  year: number | null
}

export interface ScannedEpisode {
  filePath: string
  fileName: string
  fileSize: number | null
  extension: string
  seasonNumber: number
  episodeNumber: number
  title: string | null
}

export interface ScannedShow {
  name: string
  year: number | null
  folders: string[]
  episodes: ScannedEpisode[]
}

export function normalizeShowName(folderName: string): NormalizedShow {
  let working = folderName
  let year: number | null = null

  // Extract year from parentheses or brackets first: (1998) or [1998]
  const parentheticalYear = working.match(/[([]((?:19|20)\d{2})[\])]/)
  if (parentheticalYear?.[1]) {
    year = parseInt(parentheticalYear[1], 10)
  }

  // Remove all parenthetical and bracketed content
  working = working.replace(/\([^)]*\)/g, ' ')
  working = working.replace(/\[[^\]]*\]/g, ' ')

  // Normalize dots and underscores to spaces early (before season/tag removal)
  working = working.replace(/[._]/g, ' ')

  // Remove season range patterns: S01-S08
  working = working.replace(/S\d{1,2}-S\d{1,2}/gi, ' ')

  // Remove "Seasons N to M", "Season N-M", "Season N to M"
  working = working.replace(/Seasons?\s+\d+\s+to\s+\d+/gi, ' ')
  working = working.replace(/Seasons?\s+\d+-\d+/gi, ' ')

  // Remove "Season N" or "Season NN"
  working = working.replace(/Seasons?\s+\d+/gi, ' ')

  // Remove standalone SxxExx-style season markers like S01, S02
  working = working.replace(/\bS\d{1,2}\b/gi, ' ')

  // Extract standalone year (1950-2030) if not already found
  if (year === null) {
    const standaloneYear = working.match(/\b((?:19[5-9]\d|20[0-2]\d|2030))\b/)
    if (standaloneYear?.[1]) {
      year = parseInt(standaloneYear[1], 10)
    }
  }

  // Remove all standalone years now
  working = working.replace(/\b(?:19[5-9]\d|20[0-2]\d|2030)\b/g, ' ')

  // Remove "TV Series" as a phrase before individual tag removal
  working = working.replace(/\bTV\s+Series\b/gi, ' ')

  // Remove technical/quality tags
  const technicalTags = [
    'Complete', 'Series', 'DVDRip', 'BDRip', 'BRRip', 'BluRay', 'WEB-DL', 'WEB',
    'HDTV', 'TVRip', '2160p', '1080p', '720p', '576p', '480p', '4K',
    'x265', 'x264', 'H264', 'HEVC', '10bit', 'AAC', 'AC3', 'DD5',
    'Mp4', 'MKV', 'MkvCage'
  ]

  for (const tag of technicalTags) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    working = working.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ')
  }

  // Remove codec/audio descriptors like "2.0", "5.1"
  working = working.replace(/\b\d+\.\d+\b/g, ' ')

  // Remove dashes/hyphens (standalone separators)
  working = working.replace(/\s*-+\s*/g, ' ')

  // Collapse whitespace and trim
  working = working.replace(/\s+/g, ' ').trim()

  return { name: working, year }
}

function parseSeasonFolder(folderName: string): number | null {
  const match = folderName.match(seasonFolderPattern)

  if (!match?.[1]) {
    return null
  }

  return parseInt(match[1], 10)
}

async function scanEpisodesInDirectory(directory: string): Promise<ScannedEpisode[]> {
  let entries: string[]

  try {
    entries = await readdir(directory)
  } catch {
    return []
  }

  const episodes: ScannedEpisode[] = []

  for (const entry of entries) {
    const extension = extname(entry).toLowerCase()

    if (!videoExtensions.has(extension)) {
      continue
    }

    const parsed = parseEpisodeFilename(entry)

    if (!parsed) {
      continue
    }

    const filePath = join(directory, entry)
    let fileSize: number | null = null

    try {
      const fileStat = await stat(filePath)
      fileSize = fileStat.size
    } catch {
      fileSize = null
    }

    episodes.push({
      filePath,
      fileName: entry,
      fileSize,
      extension,
      seasonNumber: parsed.seasonNumber,
      episodeNumber: parsed.episodeNumber,
      title: parsed.title
    })
  }

  return episodes
}

async function scanShowFolder(folderPath: string): Promise<ScannedEpisode[]> {
  let entries: string[]

  try {
    entries = await readdir(folderPath)
  } catch {
    return []
  }

  const episodes: ScannedEpisode[] = []
  const subdirectories: string[] = []

  for (const entry of entries) {
    const entryPath = join(folderPath, entry)
    let entryStat

    try {
      entryStat = await stat(entryPath)
    } catch {
      continue
    }

    if (entryStat.isDirectory()) {
      subdirectories.push(entry)
    }
  }

  // Check for season subfolders
  const seasonFolders = subdirectories.filter(name => parseSeasonFolder(name) !== null)

  if (seasonFolders.length > 0) {
    for (const seasonFolder of seasonFolders) {
      const seasonPath = join(folderPath, seasonFolder)
      const seasonEpisodes = await scanEpisodesInDirectory(seasonPath)
      episodes.push(...seasonEpisodes)
    }
  } else {
    // No season subfolders — try flat episodes in this directory
    const flatEpisodes = await scanEpisodesInDirectory(folderPath)
    episodes.push(...flatEpisodes)

    // Recurse into non-season subdirectories
    for (const subdirectory of subdirectories) {
      const subdirectoryPath = join(folderPath, subdirectory)
      const subdirectoryEpisodes = await scanShowFolder(subdirectoryPath)
      episodes.push(...subdirectoryEpisodes)
    }
  }

  return episodes
}

export async function discoverShows(libraryPath: string): Promise<ScannedShow[]> {
  let entries: string[]

  try {
    entries = await readdir(libraryPath)
  } catch {
    return []
  }

  const groupMap = new Map<string, ScannedShow>()

  for (const entry of entries) {
    const entryPath = join(libraryPath, entry)
    let entryStat

    try {
      entryStat = await stat(entryPath)
    } catch {
      continue
    }

    if (!entryStat.isDirectory()) {
      continue
    }

    const normalized = normalizeShowName(entry)
    const key = normalized.name.toLowerCase()

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        name: normalized.name,
        year: normalized.year,
        folders: [],
        episodes: []
      })
    }

    const group = groupMap.get(key)

    if (group) {
      group.folders.push(entryPath)

      if (normalized.year !== null && group.year === null) {
        group.year = normalized.year
      }
    }
  }

  const shows: ScannedShow[] = []

  for (const show of groupMap.values()) {
    const allEpisodes: ScannedEpisode[] = []

    for (const folder of show.folders) {
      const episodes = await scanShowFolder(folder)
      allEpisodes.push(...episodes)
    }

    allEpisodes.sort((a, b) => {
      if (a.seasonNumber !== b.seasonNumber) {
        return a.seasonNumber - b.seasonNumber
      }

      return a.episodeNumber - b.episodeNumber
    })

    if (allEpisodes.length === 0) {
      continue
    }

    shows.push({ ...show, episodes: allEpisodes })
  }

  return shows
}
