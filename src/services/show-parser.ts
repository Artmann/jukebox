export interface NormalizedShow {
  name: string
  year: number | null
}

/**
 * Normalize a show folder name to extract the base show name and year.
 * Strips season info, quality tags, codec info, and group tags.
 */
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

const seasonFolderPattern = /^Season\s+(\d+)/i

/**
 * Detect season number from a folder name.
 */
export function parseSeasonFolder(folderName: string): number | null {
  const match = folderName.match(seasonFolderPattern)

  if (!match?.[1]) {
    return null
  }

  return parseInt(match[1], 10)
}
