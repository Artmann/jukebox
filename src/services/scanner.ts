import type { Dirent } from 'fs'
import { readdir, stat } from 'fs/promises'
import { basename, extname, join } from 'path'

import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../database/layer'
import * as schema from '../database/schema'
import type { NewMovie } from '../database/schema'
import { cleanTitle, extractYear } from './filename-parser'
import { readLibraryRoot } from './library-validation'
import { subtitleExtensions, videoExtensions } from './media-extensions'
import { Metadata } from './metadata'
import { syncSubtitlesForMovie } from './subtitle-sync'
import { discoverSubtitlesForVideo } from './subtitles'

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
  // Unreadable nested folders are tolerated (the root is validated up front
  // in scanLibrary) — one bad subfolder shouldn't kill the whole scan.
  let entries: Dirent[]

  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

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

async function collectScannedVideos(
  libraryPath: string
): Promise<ScannedVideo[]> {
  const scanned: ScannedVideo[] = []

  for await (const video of scanDirectory(libraryPath)) {
    scanned.push(video)
  }

  return scanned
}

export interface ScanProgress {
  added: number
  total: number
  updated: number
}

function toError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught))
}

const tryPromise = <A>(run: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({ catch: toError, try: run })

// The scan output lines are user-facing in the server log, so they stay on
// console.log with the same text as before the Effect migration.
const consoleLog = (message: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(message)
  })

// Scans a movie library path and inserts/updates movies in the database.
// Directory walking stays on node:fs/promises inside Effect wrappers — the
// recursion and its tolerance semantics are inherited unchanged.
export class Scanner extends Effect.Service<Scanner>()('jukebox/Scanner', {
  dependencies: [Metadata.Default],
  effect: Effect.gen(function* () {
    const database = yield* Database
    const metadata = yield* Metadata

    const scanLibrary = (
      libraryPath: string,
      onProgress?: (progress: ScanProgress) => Effect.Effect<void>
    ): Effect.Effect<ScanProgress, Error> =>
      Effect.gen(function* () {
        let added = 0
        let updated = 0
        let total = 0

        yield* consoleLog(`Scanning: ${libraryPath}`)

        // Validate the library root up front — an unreadable root fails with
        // an actionable error instead of silently scanning zero files.
        yield* tryPromise(() => readLibraryRoot(libraryPath))

        const scannedVideos = yield* Effect.promise(() =>
          collectScannedVideos(libraryPath)
        )

        for (const { filePath, subtitleSiblings } of scannedVideos) {
          total++

          const fileName = basename(filePath)
          const extension = extname(fileName).toLowerCase()
          const title = cleanTitle(fileName)
          const year = extractYear(fileName)

          const fileSize = yield* Effect.promise(
            async (): Promise<number | null> => {
              try {
                const stats = await stat(filePath)

                return stats.size
              } catch {
                // Ignore stat errors
                return null
              }
            }
          )

          const now = new Date()

          const discoveredSubtitles = discoverSubtitlesForVideo(
            filePath,
            subtitleSiblings
          )

          // Check if movie already exists
          const existing = yield* tryPromise(() =>
            database
              .select()
              .from(schema.movies)
              .where(eq(schema.movies.filePath, filePath))
              .limit(1)
          )

          let movieId: number | null

          if (existing.length > 0 && existing[0]) {
            // Update existing movie - fetch metadata if not already present
            const movie = existing[0]
            movieId = movie.id
            let metadataUpdate: Partial<NewMovie> = {}

            if (!movie.externalId) {
              yield* consoleLog(`  Fetching metadata for: ${title}`)

              const movieMetadata = yield* metadata.fetchMovieMetadata(
                title,
                year ?? undefined
              )

              if (movieMetadata) {
                metadataUpdate = {
                  externalId: movieMetadata.externalId,
                  year: movieMetadata.year,
                  overview: movieMetadata.overview,
                  runtime: movieMetadata.runtime,
                  genres: movieMetadata.genres,
                  rating: movieMetadata.rating,
                  posterUrl: movieMetadata.posterUrl,
                  backdropUrl: movieMetadata.backdropUrl,
                  trailerUrl: movieMetadata.trailerUrl
                }
              }
            } else if (
              !movie.posterUrl ||
              !movie.backdropUrl ||
              !movie.trailerUrl
            ) {
              // Refresh any missing metadata for movies that have an external
              // id. This covers rows created before poster/backdrop URLs were
              // stored, and rows where a past upstream hiccup dropped the
              // trailer.
              yield* consoleLog(`  Refreshing metadata for: ${movie.title}`)

              const refreshed = yield* metadata.fetchMovieByExternalId(
                movie.externalId
              )

              if (refreshed) {
                metadataUpdate = {
                  year: movie.year ?? refreshed.year,
                  overview: movie.overview ?? refreshed.overview,
                  runtime: movie.runtime ?? refreshed.runtime,
                  genres: movie.genres ?? refreshed.genres,
                  rating: movie.rating ?? refreshed.rating,
                  posterUrl: movie.posterUrl ?? refreshed.posterUrl,
                  backdropUrl: movie.backdropUrl ?? refreshed.backdropUrl,
                  trailerUrl: movie.trailerUrl ?? refreshed.trailerUrl
                }
              }
            }

            yield* tryPromise(() =>
              database
                .update(schema.movies)
                .set({
                  title: movie.externalId ? movie.title : title,
                  fileName,
                  fileSize,
                  extension,
                  updatedAt: now,
                  ...metadataUpdate
                })
                .where(eq(schema.movies.filePath, filePath))
            )

            updated++

            if (onProgress) {
              yield* onProgress({ added, total, updated })
            }
          } else {
            // Insert new movie - fetch metadata
            yield* consoleLog(`  Fetching metadata for: ${title}`)

            const movieMetadata = yield* metadata.fetchMovieMetadata(
              title,
              year ?? undefined
            )

            const newMovie: NewMovie = {
              title: movieMetadata?.title ?? title,
              filePath,
              fileName,
              fileSize,
              extension,
              createdAt: now,
              updatedAt: now,
              externalId: movieMetadata?.externalId ?? null,
              year: movieMetadata?.year ?? year,
              overview: movieMetadata?.overview ?? null,
              runtime: movieMetadata?.runtime ?? null,
              genres: movieMetadata?.genres ?? null,
              rating: movieMetadata?.rating ?? null,
              posterUrl: movieMetadata?.posterUrl ?? null,
              backdropUrl: movieMetadata?.backdropUrl ?? null,
              trailerUrl: movieMetadata?.trailerUrl ?? null
            }

            const inserted = yield* tryPromise(() =>
              database
                .insert(schema.movies)
                .values(newMovie)
                .returning({ id: schema.movies.id })
            )

            movieId = inserted[0]?.id ?? null
            added++

            if (onProgress) {
              yield* onProgress({ added, total, updated })
            }
          }

          const resolvedMovieId = movieId

          if (resolvedMovieId !== null) {
            yield* tryPromise(() =>
              syncSubtitlesForMovie(
                database,
                resolvedMovieId,
                discoveredSubtitles
              )
            )
          }

          yield* consoleLog(`  Found: ${title}`)
        }

        yield* consoleLog(
          `Finished scanning ${libraryPath}: ${total} video file(s) found.`
        )

        return { added, updated, total }
      })

    return { scanLibrary }
  })
}) {}
