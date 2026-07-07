import { readdir, stat } from 'fs/promises'
import { extname, join } from 'path'

import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../database/layer'
import * as schema from '../database/schema'
import type { NewEpisode, NewSeason, NewShow } from '../database/schema'
import { parseEpisodeFilename } from './episode-parser'
import { readLibraryRoot } from './library-validation'
import { subtitleExtensions, videoExtensions } from './media-extensions'
import { Metadata } from './metadata'
import type { EpisodeMetadata } from './metadata'
import { normalizeShowName, parseSeasonFolder } from './show-parser'
import { syncSubtitlesForEpisode } from './subtitle-sync'
import { discoverSubtitlesForVideo } from './subtitles'

export type { NormalizedShow } from './show-parser'

export interface ScannedEpisode {
  filePath: string
  fileName: string
  fileSize: number | null
  extension: string
  seasonNumber: number
  episodeNumber: number
  title: string | null
  subtitleSiblings: string[]
}

export interface ScannedShow {
  name: string
  year: number | null
  folders: string[]
  episodes: ScannedEpisode[]
}

async function scanEpisodesInDirectory(
  directory: string
): Promise<ScannedEpisode[]> {
  let entries: string[]

  try {
    entries = await readdir(directory)
  } catch {
    return []
  }

  // Single pass: collect both video files we'll iterate and subtitle siblings
  // we'll hand to the subtitle discovery helper for each episode.
  const subtitleSiblings: string[] = []
  const videoEntries: string[] = []

  for (const entry of entries) {
    const extension = extname(entry).toLowerCase()

    if (videoExtensions.has(extension)) {
      videoEntries.push(entry)
    } else if (subtitleExtensions.has(extension)) {
      subtitleSiblings.push(entry)
    }
  }

  const episodes = await Promise.all(
    videoEntries.map(async (entry): Promise<ScannedEpisode | null> => {
      const extension = extname(entry).toLowerCase()
      const parsed = parseEpisodeFilename(entry)

      if (!parsed) {
        return null
      }

      const filePath = join(directory, entry)
      let fileSize: number | null = null

      try {
        const fileStat = await stat(filePath)
        fileSize = fileStat.size
      } catch {
        // Ignore stat errors
      }

      return {
        filePath,
        fileName: entry,
        fileSize,
        extension,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        title: parsed.title,
        subtitleSiblings
      }
    })
  )

  return episodes.filter(
    (episode): episode is ScannedEpisode => episode !== null
  )
}

async function scanShowFolder(folderPath: string): Promise<ScannedEpisode[]> {
  let entries: string[]

  try {
    entries = await readdir(folderPath)
  } catch {
    return []
  }

  const subdirectoryFlags = await Promise.all(
    entries.map(async (entry) => {
      try {
        const entryStat = await stat(join(folderPath, entry))

        return entryStat.isDirectory() ? entry : null
      } catch {
        return null
      }
    })
  )

  const subdirectories = subdirectoryFlags.filter(
    (entry): entry is string => entry !== null
  )

  const episodes: ScannedEpisode[] = []

  // Check for season subfolders
  const seasonFolders = subdirectories.filter(
    (name) => parseSeasonFolder(name) !== null
  )

  if (seasonFolders.length > 0) {
    const seasonEpisodeLists = await Promise.all(
      seasonFolders.map((seasonFolder) =>
        scanEpisodesInDirectory(join(folderPath, seasonFolder))
      )
    )

    episodes.push(...seasonEpisodeLists.flat())
  } else {
    // No season subfolders — try flat episodes in this directory
    const flatEpisodes = await scanEpisodesInDirectory(folderPath)
    episodes.push(...flatEpisodes)

    // Recurse into non-season subdirectories
    const subdirectoryEpisodeLists = await Promise.all(
      subdirectories.map((subdirectory) =>
        scanShowFolder(join(folderPath, subdirectory))
      )
    )

    episodes.push(...subdirectoryEpisodeLists.flat())
  }

  return episodes
}

export async function discoverShows(
  libraryPath: string
): Promise<ScannedShow[]> {
  // An unreadable library root is a configuration error the user must fix,
  // so it throws instead of silently scanning nothing. Nested folders below
  // keep their tolerant behavior — one bad subfolder shouldn't kill the scan.
  const entries = await readLibraryRoot(libraryPath)

  const directoryFlags = await Promise.all(
    entries.map(async (entry) => {
      try {
        const entryStat = await stat(join(libraryPath, entry))

        return entryStat.isDirectory() ? entry : null
      } catch {
        return null
      }
    })
  )

  const directoryEntries = directoryFlags.filter(
    (entry): entry is string => entry !== null
  )

  const groupMap = new Map<string, ScannedShow>()

  for (const entry of directoryEntries) {
    const entryPath = join(libraryPath, entry)
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

  const showsWithEpisodes = await Promise.all(
    Array.from(groupMap.values()).map(
      async (show): Promise<ScannedShow | null> => {
        const episodeLists = await Promise.all(
          show.folders.map((folder) => scanShowFolder(folder))
        )

        const allEpisodes = episodeLists.flat()

        allEpisodes.sort((a, b) => {
          if (a.seasonNumber !== b.seasonNumber) {
            return a.seasonNumber - b.seasonNumber
          }

          return a.episodeNumber - b.episodeNumber
        })

        if (allEpisodes.length === 0) {
          return null
        }

        return { ...show, episodes: allEpisodes }
      }
    )
  )

  return showsWithEpisodes.filter((show): show is ScannedShow => show !== null)
}

export interface ShowScanProgress {
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

// Scans a show library path and inserts/updates shows, seasons, and episodes.
// Directory walking (discoverShows and its helpers) stays plain async — the
// recursion and its tolerance semantics are inherited unchanged.
export class ShowScanner extends Effect.Service<ShowScanner>()(
  'jukebox/ShowScanner',
  {
    dependencies: [Metadata.Default],
    effect: Effect.gen(function* () {
      const database = yield* Database
      const metadata = yield* Metadata

      const scanShowLibrary = (
        libraryPath: string,
        onProgress?: (progress: ShowScanProgress) => Effect.Effect<void>
      ): Effect.Effect<ShowScanProgress, Error> =>
        Effect.gen(function* () {
          let added = 0
          let updated = 0
          let total = 0

          yield* consoleLog(`Scanning: ${libraryPath}`)

          const discoveredShows = yield* tryPromise(() =>
            discoverShows(libraryPath)
          )

          for (const discoveredShow of discoveredShows) {
            const { name, year, episodes } = discoveredShow
            const folderPath = discoveredShow.folders[0] ?? ''

            // Find or create the show record
            const existingShows = yield* tryPromise(() =>
              database
                .select()
                .from(schema.shows)
                .where(eq(schema.shows.folderPath, folderPath))
                .limit(1)
            )

            let showId: number
            let externalId: string | null

            if (existingShows.length > 0 && existingShows[0]) {
              const existingShow = existingShows[0]
              showId = existingShow.id
              externalId = existingShow.externalId ?? null

              // Refresh any missing artwork/overview for shows that have an
              // external id but are missing data (e.g. after a migration that
              // cleared URLs).
              if (
                externalId !== null &&
                (!existingShow.posterUrl ||
                  !existingShow.backdropUrl ||
                  !existingShow.overview)
              ) {
                yield* consoleLog(
                  `  Refreshing metadata for show: ${existingShow.title}`
                )

                const refreshed =
                  yield* metadata.fetchShowByExternalId(externalId)

                if (refreshed) {
                  const refreshedShowId = showId

                  yield* tryPromise(() =>
                    database
                      .update(schema.shows)
                      .set({
                        year: existingShow.year ?? refreshed.year,
                        overview: existingShow.overview ?? refreshed.overview,
                        genres: existingShow.genres ?? refreshed.genres,
                        rating: existingShow.rating ?? refreshed.rating,
                        posterUrl:
                          existingShow.posterUrl ?? refreshed.posterUrl,
                        backdropUrl:
                          existingShow.backdropUrl ?? refreshed.backdropUrl,
                        updatedAt: new Date()
                      })
                      .where(eq(schema.shows.id, refreshedShowId))
                  )
                }
              }
            } else {
              yield* consoleLog(`  Fetching metadata for show: ${name}`)

              const showMetadata = yield* metadata.fetchShowMetadata(
                name,
                year ?? undefined
              )

              const now = new Date()
              const newShow: NewShow = {
                title: showMetadata?.title ?? name,
                folderPath,
                externalId: showMetadata?.externalId ?? null,
                year: showMetadata?.year ?? year ?? null,
                overview: showMetadata?.overview ?? null,
                genres: showMetadata?.genres ?? null,
                rating: showMetadata?.rating ?? null,
                posterUrl: showMetadata?.posterUrl ?? null,
                backdropUrl: showMetadata?.backdropUrl ?? null,
                createdAt: now,
                updatedAt: now
              }

              const inserted = yield* tryPromise(() =>
                database
                  .insert(schema.shows)
                  .values(newShow)
                  .returning({ id: schema.shows.id })
              )

              showId = inserted[0]?.id ?? 0
              externalId = showMetadata?.externalId ?? null
            }

            // Group episodes by season number
            const seasonMap = new Map<number, ScannedEpisode[]>()

            for (const episode of episodes) {
              const seasonEpisodes = seasonMap.get(episode.seasonNumber) ?? []
              seasonEpisodes.push(episode)
              seasonMap.set(episode.seasonNumber, seasonEpisodes)
            }

            for (const [seasonNumber, seasonEpisodes] of seasonMap) {
              // Fetch season metadata once per season
              let metadataEpisodes: EpisodeMetadata[] = []

              // Find or create the season record
              const existingSeasons = yield* tryPromise(() =>
                database
                  .select()
                  .from(schema.seasons)
                  .where(
                    and(
                      eq(schema.seasons.showId, showId),
                      eq(schema.seasons.seasonNumber, seasonNumber)
                    )
                  )
                  .limit(1)
              )

              let seasonId: number

              if (existingSeasons.length > 0 && existingSeasons[0]) {
                seasonId = existingSeasons[0].id

                if (externalId !== null) {
                  const seasonMetadata = yield* metadata.fetchSeasonMetadata(
                    externalId,
                    seasonNumber
                  )
                  metadataEpisodes = seasonMetadata?.episodes ?? []
                }
              } else {
                let seasonMetadata = null

                if (externalId !== null) {
                  yield* consoleLog(
                    `  Fetching metadata for season ${seasonNumber} of: ${name}`
                  )
                  seasonMetadata = yield* metadata.fetchSeasonMetadata(
                    externalId,
                    seasonNumber
                  )
                  metadataEpisodes = seasonMetadata?.episodes ?? []
                }

                const newSeason: NewSeason = {
                  showId,
                  seasonNumber,
                  name: seasonMetadata?.name ?? null,
                  overview: seasonMetadata?.overview ?? null,
                  posterUrl: seasonMetadata?.posterUrl ?? null,
                  episodeCount: seasonEpisodes.length
                }

                const insertedSeason = yield* tryPromise(() =>
                  database
                    .insert(schema.seasons)
                    .values(newSeason)
                    .returning({ id: schema.seasons.id })
                )

                seasonId = insertedSeason[0]?.id ?? 0
              }

              for (const scannedEpisode of seasonEpisodes) {
                total++

                const metadataEpisode = metadataEpisodes.find(
                  (episode) =>
                    episode.episodeNumber === scannedEpisode.episodeNumber
                )

                const episodeTitle =
                  metadataEpisode?.title ??
                  scannedEpisode.title ??
                  `Episode ${scannedEpisode.episodeNumber}`

                // Check for existing episode
                const existingEpisodes = yield* tryPromise(() =>
                  database
                    .select()
                    .from(schema.episodes)
                    .where(eq(schema.episodes.filePath, scannedEpisode.filePath))
                    .limit(1)
                )

                const now = new Date()

                let episodeId: number | null

                if (existingEpisodes.length > 0 && existingEpisodes[0]) {
                  episodeId = existingEpisodes[0].id

                  yield* tryPromise(() =>
                    database
                      .update(schema.episodes)
                      .set({
                        title: episodeTitle,
                        fileName: scannedEpisode.fileName,
                        fileSize: scannedEpisode.fileSize,
                        extension: scannedEpisode.extension,
                        updatedAt: now
                      })
                      .where(
                        eq(schema.episodes.filePath, scannedEpisode.filePath)
                      )
                  )

                  updated++

                  if (onProgress) {
                    yield* onProgress({ added, total, updated })
                  }
                } else {
                  const resolvedSeasonId = seasonId
                  const resolvedShowId = showId

                  const newEpisode: NewEpisode = {
                    showId: resolvedShowId,
                    seasonId: resolvedSeasonId,
                    seasonNumber,
                    episodeNumber: scannedEpisode.episodeNumber,
                    title: episodeTitle,
                    filePath: scannedEpisode.filePath,
                    fileName: scannedEpisode.fileName,
                    fileSize: scannedEpisode.fileSize,
                    extension: scannedEpisode.extension,
                    externalId: null,
                    overview: metadataEpisode?.overview ?? null,
                    runtime: metadataEpisode?.runtime ?? null,
                    stillUrl: metadataEpisode?.stillUrl ?? null,
                    createdAt: now,
                    updatedAt: now
                  }

                  const insertedEpisode = yield* tryPromise(() =>
                    database
                      .insert(schema.episodes)
                      .values(newEpisode)
                      .returning({ id: schema.episodes.id })
                  )

                  episodeId = insertedEpisode[0]?.id ?? null
                  added++

                  if (onProgress) {
                    yield* onProgress({ added, total, updated })
                  }
                }

                const resolvedEpisodeId = episodeId

                if (resolvedEpisodeId !== null) {
                  const discoveredSubtitles = discoverSubtitlesForVideo(
                    scannedEpisode.filePath,
                    scannedEpisode.subtitleSiblings
                  )

                  yield* tryPromise(() =>
                    syncSubtitlesForEpisode(
                      database,
                      resolvedEpisodeId,
                      discoveredSubtitles
                    )
                  )
                }
              }
            }

            yield* consoleLog(
              `  Found show: ${name} (${episodes.length} episodes)`
            )
          }

          yield* consoleLog(
            `Finished scanning ${libraryPath}: ${total} episode file(s) found.`
          )

          return { added, updated, total }
        })

      return { scanShowLibrary }
    })
  }
) {}
