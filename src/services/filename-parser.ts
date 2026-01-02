export interface ParsedFilename {
  title: string
  year: number | null
}

/**
 * Parse a movie filename to extract title and year.
 * The year marks the boundary between the title and technical info.
 *
 * Examples:
 * - Jurassic.Park.1993.720p.BrRip.264.YIFY.mp4 -> { title: "Jurassic Park", year: 1993 }
 * - The.Social.Network.(2010).1080p.BrRip.x264.mp4 -> { title: "The Social Network", year: 2010 }
 */
export function parseFilename(fileName: string): ParsedFilename {
  // Remove file extension
  let name = fileName.replace(/\.[^.]+$/, '')

  // Try to find year in parentheses/brackets first: (2010), [2010]
  const bracketYearMatch = name.match(/[\(\[]((?:19|20)\d{2})[\)\]]/)
  if (bracketYearMatch?.[1]) {
    const year = parseInt(bracketYearMatch[1], 10)
    const yearIndex = bracketYearMatch.index!
    let title = name.substring(0, yearIndex)

    // Replace separators with spaces and clean up
    title = title.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
    // Remove trailing dashes or hyphens
    title = title.replace(/[-–—]+$/, '').trim()

    return { title, year }
  }

  // Find standalone year (19xx or 20xx) that's likely the release year
  // Look for year followed by resolution, codec, or other technical indicators
  const yearPattern = /[.\s]((?:19|20)\d{2})[.\s]/g
  let match: RegExpExecArray | null
  let bestMatch: { year: number; index: number } | null = null

  while ((match = yearPattern.exec(name)) !== null) {
    const yearStr = match[1]
    if (!yearStr) continue
    const year = parseInt(yearStr, 10)
    // Check what comes after the year - if it looks like technical info, this is likely the release year
    const afterYear = name.substring(match.index + match[0].length)
    const looksLikeTechInfo =
      /^(720p|1080p|2160p|4K|BluRay|BrRip|BDRip|WEB|HDTV|DVDRip|x264|x265|H\.?264)/i.test(
        afterYear
      )

    if (looksLikeTechInfo || !bestMatch) {
      bestMatch = { year, index: match.index }
      if (looksLikeTechInfo) break // Found a confident match
    }
  }

  if (bestMatch) {
    let title = name.substring(0, bestMatch.index)
    title = title.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
    title = title.replace(/[-–—]+$/, '').trim()
    return { title, year: bestMatch.year }
  }

  // No year found - just clean up the whole name
  let title = name.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
  return { title, year: null }
}

/**
 * Extract year from a filename if present
 */
export function extractYear(fileName: string): number | null {
  return parseFilename(fileName).year
}

/**
 * Clean a movie filename to extract a readable title
 */
export function cleanTitle(fileName: string): string {
  return parseFilename(fileName).title
}
