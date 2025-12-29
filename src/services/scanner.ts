import { readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { db, schema } from '../database'
import { eq } from 'drizzle-orm'
import type { NewMovie } from '../database/schema'

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.m4v',
  '.webm',
  '.flv',
  '.mpeg',
  '.mpg'
])

/**
 * Clean a movie filename to extract a readable title
 * Removes: year, quality, codec, release group, etc.
 */
export function cleanTitle(fileName: string): string {
  let title = fileName

  // Remove file extension
  title = title.replace(/\.[^.]+$/, '')

  // Replace dots and underscores with spaces
  title = title.replace(/[._]/g, ' ')

  // Remove year in parentheses or brackets: (2024), [2024]
  title = title.replace(/[\(\[]\d{4}[\)\]]/g, '')

  // Remove standalone year: 2024, 2023, etc. (but keep if part of title)
  title = title.replace(/\s(19|20)\d{2}(\s|$)/g, ' ')

  // Remove quality indicators
  title = title.replace(
    /\b(2160p|1080p|720p|480p|4K|UHD|HD|SD|BluRay|Blu-Ray|BRRip|BDRip|DVDRip|HDRip|WEBRip|WEB-DL|HDTV|CAM|TS|TC|SCR|R5|DVDScr)\b/gi,
    ''
  )

  // Remove codec info
  title = title.replace(
    /\b(x264|x265|H\.?264|H\.?265|HEVC|AVC|XviD|DivX|VP9|AV1|10bit|HDR|HDR10|DV|Dolby Vision)\b/gi,
    ''
  )

  // Remove audio info
  title = title.replace(
    /\b(AAC|AC3|DTS|DTS-HD|TrueHD|Atmos|FLAC|MP3|5\.1|7\.1|2\.0)\b/gi,
    ''
  )

  // Remove common release group patterns (at end, often in brackets)
  title = title.replace(/[\[\(][A-Za-z0-9]+[\]\)]$/g, '')

  // Remove common release group prefixes
  title = title.replace(
    /\b(YIFY|YTS|RARBG|EVO|SPARKS|GECKOS|FGT|NTb|AMZN|NF|DSNP|HMAX|ATVP)\b/gi,
    ''
  )

  // Remove "EXTENDED", "REMASTERED", "UNRATED", etc.
  title = title.replace(
    /\b(EXTENDED|REMASTERED|UNRATED|DIRECTORS CUT|THEATRICAL|IMAX|PROPER|REPACK)\b/gi,
    ''
  )

  // Remove extra whitespace
  title = title.replace(/\s+/g, ' ').trim()

  // Remove trailing dashes or other punctuation
  title = title.replace(/[-–—]+$/, '').trim()

  return title || fileName
}

/**
 * Recursively scan a directory for video files
 */
async function* scanDirectory(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      yield* scanDirectory(fullPath)
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase()
      if (VIDEO_EXTENSIONS.has(ext)) {
        yield fullPath
      }
    }
  }
}

/**
 * Scan a library path and insert movies into the database
 */
export async function scanLibrary(libraryPath: string): Promise<{
  added: number
  updated: number
  total: number
}> {
  let added = 0
  let updated = 0
  let total = 0

  console.log(`Scanning: ${libraryPath}`)

  for await (const filePath of scanDirectory(libraryPath)) {
    total++
    const fileName = basename(filePath)
    const ext = extname(fileName).toLowerCase()
    const title = cleanTitle(fileName)

    let fileSize: number | null = null
    try {
      const stats = await stat(filePath)
      fileSize = stats.size
    } catch {
      // Ignore stat errors
    }

    const now = new Date()

    // Check if movie already exists
    const existing = await db
      .select()
      .from(schema.movies)
      .where(eq(schema.movies.filePath, filePath))
      .limit(1)

    if (existing.length > 0) {
      // Update existing movie
      await db
        .update(schema.movies)
        .set({
          title,
          fileName,
          fileSize,
          extension: ext,
          updatedAt: now
        })
        .where(eq(schema.movies.filePath, filePath))
      updated++
    } else {
      // Insert new movie
      const newMovie: NewMovie = {
        title,
        filePath,
        fileName,
        fileSize,
        extension: ext,
        createdAt: now,
        updatedAt: now
      }
      await db.insert(schema.movies).values(newMovie)
      added++
    }

    console.log(`  Found: ${title}`)
  }

  return { added, updated, total }
}
