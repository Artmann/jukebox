import { readdir, stat } from 'fs/promises'
import { extname, join } from 'path'

import { and, eq } from 'drizzle-orm'

import { db, schema } from '../database'
import type { NewEpisode, NewSeason, NewShow } from '../database/schema'
import { parseEpisodeFilename } from './episode-parser'
import { normalizeShowName, parseSeasonFolder } from './show-parser'
import { fetchSeasonMetadata, fetchShowMetadata } from './tmdb'

export type { NormalizedShow } from './show-parser'
export { normalizeShowName } from './show-parser'

const videoExtensions = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.flv', '.mpeg', '.mpg'
])

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
      // Ignore stat errors
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

export async function scanShowLibrary(libraryPath: string): Promise<{ added: number; updated: number; total: number }> {
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
    let tmdbId: number | null

    if (existingShows.length > 0 && existingShows[0]) {
      showId = existingShows[0].id
      tmdbId = existingShows[0].tmdbId ?? null
    } else {
      console.log(`  Fetching TMDB metadata for show: ${name}`)
      const metadata = await fetchShowMetadata(name, year ?? undefined)

      const now = new Date()
      const newShow: NewShow = {
        title: metadata?.title ?? name,
        folderPath,
        tmdbId: metadata?.tmdbId ?? null,
        year: metadata?.year ?? year ?? null,
        overview: metadata?.overview ?? null,
        genres: metadata?.genres ?? null,
        rating: metadata?.rating ?? null,
        posterPath: metadata?.posterPath ?? null,
        backdropPath: metadata?.backdropPath ?? null,
        createdAt: now,
        updatedAt: now
      }

      const inserted = await db
        .insert(schema.shows)
        .values(newShow)
        .returning({ id: schema.shows.id })

      showId = inserted[0]?.id ?? 0
      tmdbId = metadata?.tmdbId ?? null
    }

    // Group episodes by season number
    const seasonMap = new Map<number, ScannedEpisode[]>()

    for (const episode of episodes) {
      const seasonEpisodes = seasonMap.get(episode.seasonNumber) ?? []
      seasonEpisodes.push(episode)
      seasonMap.set(episode.seasonNumber, seasonEpisodes)
    }

    for (const [seasonNumber, seasonEpisodes] of seasonMap) {
      // Fetch TMDB season metadata once per season
      let tmdbEpisodes: { episodeNumber: number; title: string; overview: string; runtime: number | null; stillPath: string | null }[] = []

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

        if (tmdbId !== null) {
          const seasonMetadata = await fetchSeasonMetadata(tmdbId, seasonNumber)
          tmdbEpisodes = seasonMetadata?.episodes ?? []
        }
      } else {
        let seasonMetadata = null

        if (tmdbId !== null) {
          console.log(`  Fetching TMDB metadata for season ${seasonNumber} of: ${name}`)
          seasonMetadata = await fetchSeasonMetadata(tmdbId, seasonNumber)
          tmdbEpisodes = seasonMetadata?.episodes ?? []
        }

        const newSeason: NewSeason = {
          showId,
          seasonNumber,
          name: seasonMetadata?.name ?? null,
          overview: seasonMetadata?.overview ?? null,
          posterPath: seasonMetadata?.posterPath ?? null,
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

        const tmdbEpisode = tmdbEpisodes.find(
          (e) => e.episodeNumber === scannedEpisode.episodeNumber
        )

        const episodeTitle =
          tmdbEpisode?.title ??
          scannedEpisode.title ??
          `Episode ${scannedEpisode.episodeNumber}`

        // Check for existing episode
        const existingEpisodes = await db
          .select()
          .from(schema.episodes)
          .where(eq(schema.episodes.filePath, scannedEpisode.filePath))
          .limit(1)

        const now = new Date()

        if (existingEpisodes.length > 0) {
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
            tmdbId: tmdbEpisode ? null : null,
            overview: tmdbEpisode?.overview ?? null,
            runtime: tmdbEpisode?.runtime ?? null,
            stillPath: tmdbEpisode?.stillPath ?? null,
            createdAt: now,
            updatedAt: now
          }

          await db.insert(schema.episodes).values(newEpisode)
          added++
        }
      }
    }

    console.log(`  Found show: ${name} (${episodes.length} episodes)`)
  }

  return { added, updated, total }
}
