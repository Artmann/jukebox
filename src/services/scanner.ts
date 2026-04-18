import { readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { db, schema } from '../database'
import { eq } from 'drizzle-orm'
import type { NewMovie } from '../database/schema'
import { fetchMovieMetadata, getMovieVideos, getTrailerUrl } from './tmdb'
import { cleanTitle, extractYear } from './filename-parser'
import { subtitleExtensions, videoExtensions } from './media-extensions'
import { discoverSubtitlesForVideo } from './subtitles'
import { syncSubtitlesForMovie } from './subtitle-sync'

interface ScannedVideo {
  filePath: string
  subtitleSiblings: string[]
}

/**
 * Recursively scan a directory for video files. Each yielded entry includes
 * the subtitle siblings sitting in the same folder so subtitle discovery
 * piggybacks on the directory read instead of re-globbing per file.
 */
async function* scanDirectory(dir: string): AsyncGenerator<ScannedVideo> {
  const entries = await readdir(dir, { withFileTypes: true })

  const videoFiles: string[] = []
  const subtitleSiblings: string[] = []
  const subdirectories: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      subdirectories.push(entry.name)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const extension = extname(entry.name).toLowerCase()

    if (videoExtensions.has(extension)) {
      videoFiles.push(entry.name)
    } else if (subtitleExtensions.has(extension)) {
      subtitleSiblings.push(entry.name)
    }
  }

  for (const videoFile of videoFiles) {
    yield {
      filePath: join(dir, videoFile),
      subtitleSiblings
    }
  }

  for (const subdirectory of subdirectories) {
    yield* scanDirectory(join(dir, subdirectory))
  }
}

/**
 * Scan a library path and insert movies into the database
 */
export interface ScanProgress {
  added: number
  total: number
  updated: number
}

export async function scanLibrary(
  libraryPath: string,
  onProgress?: (progress: ScanProgress) => void | Promise<void>
): Promise<ScanProgress> {
  let added = 0
  let updated = 0
  let total = 0

  console.log(`Scanning: ${libraryPath}`)

  for await (const { filePath, subtitleSiblings } of scanDirectory(
    libraryPath
  )) {
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

    const discoveredSubtitles = discoverSubtitlesForVideo(
      filePath,
      subtitleSiblings
    )

    // Check if movie already exists
    const existing = await db
      .select()
      .from(schema.movies)
      .where(eq(schema.movies.filePath, filePath))
      .limit(1)

    let movieId: number | null

    if (existing.length > 0 && existing[0]) {
      // Update existing movie - fetch TMDB data if not already present
      const movie = existing[0]
      movieId = movie.id
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
      await onProgress?.({ added, total, updated })
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
      const inserted = await db
        .insert(schema.movies)
        .values(newMovie)
        .returning({ id: schema.movies.id })
      movieId = inserted[0]?.id ?? null
      added++
      await onProgress?.({ added, total, updated })
    }

    if (movieId !== null) {
      await syncSubtitlesForMovie(movieId, discoveredSubtitles)
    }

    console.log(`  Found: ${title}`)
  }

  return { added, updated, total }
}
