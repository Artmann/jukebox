import { readdir, stat } from 'fs/promises'
import { extname, join } from 'path'

import { and, eq } from 'drizzle-orm'

import { db, schema } from '../database'
import type { NewEpisode, NewSeason, NewShow } from '../database/schema'
import { parseEpisodeFilename } from './episode-parser'
import { readLibraryRoot } from './library-validation'
import { subtitleExtensions, videoExtensions } from './media-extensions'
import { normalizeShowName, parseSeasonFolder } from './show-parser'
import { syncSubtitlesForEpisode } from './subtitle-sync'
import { discoverSubtitlesForVideo } from './subtitles'
import {
  fetchSeasonMetadata,
  fetchShowByExternalId,
  fetchShowMetadata
} from './metadata'

export type { NormalizedShow } from './show-parser'
export { normalizeShowName } from './show-parser'

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

  return episodes.filter((episode): episode is ScannedEpisode => episode !== null)
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

export async function scanShowLibrary(
  libraryPath: string,
  onProgress?: (progress: ShowScanProgress) => void | Promise<void>
): Promise<{ added: number; updated: number; total: number }> {
  let added = 0
  let updated = 0
  let total = 0

  console.log(`Scanning: ${libraryPath}`)

  const discoveredShows = await discoverShows(libraryPath)

  for (const discoveredShow of discoveredShows) {
    const { name, year, episodes } = discoveredShow
    const folderPath = discoveredShow.folders[0] ?? ''

    // Find or create the show record
    const existingShows = await db
      .select()
      .from(schema.shows)
      .where(eq(schema.shows.folderPath, folderPath))
      .limit(1)

    let showId: number
    let externalId: string | null

    if (existingShows.length > 0 && existingShows[0]) {
      const existingShow = existingShows[0]
      showId = existingShow.id
      externalId = existingShow.externalId ?? null

      // Refresh any missing artwork/overview for shows that have an external
      // id but are missing data (e.g. after a migration that cleared URLs).
      if (
        externalId !== null &&
        (!existingShow.posterUrl ||
          !existingShow.backdropUrl ||
          !existingShow.overview)
      ) {
        console.log(`  Refreshing metadata for show: ${existingShow.title}`)
        const refreshed = await fetchShowByExternalId(externalId)

        if (refreshed) {
          await db
            .update(schema.shows)
            .set({
              year: existingShow.year ?? refreshed.year,
              overview: existingShow.overview ?? refreshed.overview,
              genres: existingShow.genres ?? refreshed.genres,
              rating: existingShow.rating ?? refreshed.rating,
              posterUrl: existingShow.posterUrl ?? refreshed.posterUrl,
              backdropUrl: existingShow.backdropUrl ?? refreshed.backdropUrl,
              updatedAt: new Date()
            })
            .where(eq(schema.shows.id, showId))
        }
      }
    } else {
      console.log(`  Fetching metadata for show: ${name}`)
      const metadata = await fetchShowMetadata(name, year ?? undefined)

      const now = new Date()
      const newShow: NewShow = {
        title: metadata?.title ?? name,
        folderPath,
        externalId: metadata?.externalId ?? null,
        year: metadata?.year ?? year ?? null,
        overview: metadata?.overview ?? null,
        genres: metadata?.genres ?? null,
        rating: metadata?.rating ?? null,
        posterUrl: metadata?.posterUrl ?? null,
        backdropUrl: metadata?.backdropUrl ?? null,
        createdAt: now,
        updatedAt: now
      }

      const inserted = await db
        .insert(schema.shows)
        .values(newShow)
        .returning({ id: schema.shows.id })

      showId = inserted[0]?.id ?? 0
      externalId = metadata?.externalId ?? null
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
      let metadataEpisodes: {
        episodeNumber: number
        title: string
        overview: string
        runtime: number | null
        stillUrl: string | null
      }[] = []

      // Find or create the season record
      const existingSeasons = await db
        .select()
        .from(schema.seasons)
        .where(
          and(
            eq(schema.seasons.showId, showId),
            eq(schema.seasons.seasonNumber, seasonNumber)
          )
        )
        .limit(1)

      let seasonId: number

      if (existingSeasons.length > 0 && existingSeasons[0]) {
        seasonId = existingSeasons[0].id

        if (externalId !== null) {
          const seasonMetadata = await fetchSeasonMetadata(
            externalId,
            seasonNumber
          )
          metadataEpisodes = seasonMetadata?.episodes ?? []
        }
      } else {
        let seasonMetadata = null

        if (externalId !== null) {
          console.log(
            `  Fetching metadata for season ${seasonNumber} of: ${name}`
          )
          seasonMetadata = await fetchSeasonMetadata(externalId, seasonNumber)
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

        const insertedSeason = await db
          .insert(schema.seasons)
          .values(newSeason)
          .returning({ id: schema.seasons.id })

        seasonId = insertedSeason[0]?.id ?? 0
      }

      for (const scannedEpisode of seasonEpisodes) {
        total++

        const metadataEpisode = metadataEpisodes.find(
          (e) => e.episodeNumber === scannedEpisode.episodeNumber
        )

        const episodeTitle =
          metadataEpisode?.title ??
          scannedEpisode.title ??
          `Episode ${scannedEpisode.episodeNumber}`

        // Check for existing episode
        const existingEpisodes = await db
          .select()
          .from(schema.episodes)
          .where(eq(schema.episodes.filePath, scannedEpisode.filePath))
          .limit(1)

        const now = new Date()

        let episodeId: number | null

        if (existingEpisodes.length > 0 && existingEpisodes[0]) {
          episodeId = existingEpisodes[0].id

          await db
            .update(schema.episodes)
            .set({
              title: episodeTitle,
              fileName: scannedEpisode.fileName,
              fileSize: scannedEpisode.fileSize,
              extension: scannedEpisode.extension,
              updatedAt: now
            })
            .where(eq(schema.episodes.filePath, scannedEpisode.filePath))

          updated++
          await onProgress?.({ added, total, updated })
        } else {
          const newEpisode: NewEpisode = {
            showId,
            seasonId,
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

          const insertedEpisode = await db
            .insert(schema.episodes)
            .values(newEpisode)
            .returning({ id: schema.episodes.id })

          episodeId = insertedEpisode[0]?.id ?? null
          added++
          await onProgress?.({ added, total, updated })
        }

        if (episodeId !== null) {
          const discoveredSubtitles = discoverSubtitlesForVideo(
            scannedEpisode.filePath,
            scannedEpisode.subtitleSiblings
          )

          await syncSubtitlesForEpisode(episodeId, discoveredSubtitles)
        }
      }
    }

    console.log(`  Found show: ${name} (${episodes.length} episodes)`)
  }

  return { added, updated, total }
}
