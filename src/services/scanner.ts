import { readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { db, schema } from '../database'
import { eq } from 'drizzle-orm'
import type { NewMovie } from '../database/schema'
import { fetchMovieMetadata, getMovieVideos, getTrailerUrl } from './tmdb'
import { cleanTitle, extractYear } from './filename-parser'

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
    const year = extractYear(fileName)

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

    if (existing.length > 0 && existing[0]) {
      // Update existing movie - fetch TMDB data if not already present
      const movie = existing[0]
      let tmdbData: Partial<NewMovie> = {}

      if (!movie.tmdbId) {
        console.log(`  Fetching TMDB metadata for: ${title}`)
        const metadata = await fetchMovieMetadata(title, year ?? undefined)
        if (metadata) {
          tmdbData = {
            tmdbId: metadata.tmdbId,
            year: metadata.year,
            overview: metadata.overview,
            runtime: metadata.runtime,
            genres: metadata.genres,
            rating: metadata.rating,
            posterPath: metadata.posterPath,
            backdropPath: metadata.backdropPath,
            trailerUrl: metadata.trailerUrl
          }
        }
      } else if (!movie.trailerUrl && movie.tmdbId) {
        // Fetch trailer for movies that have TMDB data but no trailer
        console.log(`  Fetching trailer for: ${movie.title}`)
        try {
          const videos = await getMovieVideos(movie.tmdbId)
          const trailerUrl = getTrailerUrl(videos)
          if (trailerUrl) {
            tmdbData = { trailerUrl }
          }
        } catch {
          // Ignore errors fetching trailer
        }
      }

      await db
        .update(schema.movies)
        .set({
          title: movie.tmdbId ? movie.title : title,
          fileName,
          fileSize,
          extension: ext,
          updatedAt: now,
          ...tmdbData
        })
        .where(eq(schema.movies.filePath, filePath))
      updated++
    } else {
      // Insert new movie - fetch TMDB metadata
      console.log(`  Fetching TMDB metadata for: ${title}`)
      const metadata = await fetchMovieMetadata(title, year ?? undefined)

      const newMovie: NewMovie = {
        title: metadata?.title ?? title,
        filePath,
        fileName,
        fileSize,
        extension: ext,
        createdAt: now,
        updatedAt: now,
        tmdbId: metadata?.tmdbId ?? null,
        year: metadata?.year ?? year,
        overview: metadata?.overview ?? null,
        runtime: metadata?.runtime ?? null,
        genres: metadata?.genres ?? null,
        rating: metadata?.rating ?? null,
        posterPath: metadata?.posterPath ?? null,
        backdropPath: metadata?.backdropPath ?? null,
        trailerUrl: metadata?.trailerUrl ?? null
      }
      await db.insert(schema.movies).values(newMovie)
      added++
    }

    console.log(`  Found: ${title}`)
  }

  return { added, updated, total }
}
