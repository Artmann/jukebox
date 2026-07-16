import path from 'path'

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'

import type { DrizzleDatabase } from '../database/layer'
import { libraryPathPrefixPattern } from '../database/path-prefix'
import * as schema from '../database/schema'
import type { Episode, Show } from '../database/schema'
import { pathIsReadable } from './library-validation'
import { normalizeShowName } from './show-parser'

export interface ReconcileResult {
  removedEpisodes: number
  removedSeasons: number
  removedShows: number
}

// Every identity a show row answers to: its external metadata id (stable
// across folder renames) and its normalized title. Two rows sharing either
// key are considered the same show for reconciliation.
function identityKeysOf(show: Show): string[] {
  const keys: string[] = []

  if (show.externalId !== null) {
    keys.push(`external:${show.externalId}`)
  }

  keys.push(`title:${normalizeShowName(show.title).name.toLowerCase()}`)

  return keys
}

function isUnderPath(candidatePath: string, rootPath: string): boolean {
  const resolvedRoot = path.resolve(rootPath)
  const rootWithSeparator = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : `${resolvedRoot}${path.sep}`

  // Windows paths are case-insensitive; lowercasing both sides keeps the
  // guard from missing a library because of drive-letter casing.
  return path
    .resolve(candidatePath)
    .toLowerCase()
    .startsWith(rootWithSeparator.toLowerCase())
}

interface SurvivorEntry {
  episodeId: number
  fromScannedShow: boolean
}

/**
 * Clean up stale show data after a library scan: episodes whose files no
 * longer exist on disk are removed, then seasons and shows that end up empty.
 * Duplicate show rows (same external id or normalized title) left behind by
 * folder moves are merged into the surviving row — watch progress and
 * favorites are carried over first. Subtitle rows are intentionally dropped
 * with their episode (cascade): they point at sidecar files next to the old
 * video paths, and the scan already re-discovered sidecars at the new
 * location.
 *
 * Scope is limited to shows under the scanned library root, plus shows
 * anywhere that share identity with a show touched by this scan. Shows that
 * belong to a different configured library whose root is currently unreadable
 * (e.g. an unplugged drive) are skipped so they can't be merged away while
 * temporarily offline.
 */
export async function reconcileShowLibrary(
  database: DrizzleDatabase,
  libraryPath: string,
  scannedShowIds: number[]
): Promise<ReconcileResult> {
  const allShows = await database.select().from(schema.shows)

  const scannedShows = allShows.filter((show) =>
    scannedShowIds.includes(show.id)
  )

  const scannedIdentityKeys = new Set(
    scannedShows.flatMap((show) => identityKeysOf(show))
  )

  const libraryPattern = libraryPathPrefixPattern(libraryPath)

  const showsUnderLibrary = await database
    .select({ id: schema.shows.id })
    .from(schema.shows)
    .where(sql`${schema.shows.folderPath} LIKE ${libraryPattern} ESCAPE '\\'`)

  const showIdsUnderLibrary = new Set(showsUnderLibrary.map((row) => row.id))

  const identityMates = allShows.filter(
    (show) =>
      !showIdsUnderLibrary.has(show.id) &&
      identityKeysOf(show).some((key) => scannedIdentityKeys.has(key))
  )

  // Unplugged-drive guard: an identity mate that lives under another
  // configured show library is only fair game when that library's root is
  // readable right now. Otherwise every one of its files would look missing
  // and the show would be wrongly merged away.
  const showLibraries = await database
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.type, 'shows'))

  const guardedIdentityMates: Show[] = []

  for (const show of identityMates) {
    const owningLibrary = showLibraries.find(
      (library) =>
        !isUnderPath(library.path, libraryPath) &&
        !isUnderPath(libraryPath, library.path) &&
        isUnderPath(show.folderPath, library.path)
    )

    if (owningLibrary && !(await pathIsReadable(owningLibrary.path))) {
      continue
    }

    guardedIdentityMates.push(show)
  }

  const candidateShows = [
    ...allShows.filter((show) => showIdsUnderLibrary.has(show.id)),
    ...guardedIdentityMates
  ]

  if (candidateShows.length === 0) {
    return { removedEpisodes: 0, removedSeasons: 0, removedShows: 0 }
  }

  const candidateShowIds = candidateShows.map((show) => show.id)
  const showsById = new Map(allShows.map((show) => [show.id, show]))
  const scannedShowIdSet = new Set(scannedShowIds)

  const candidateEpisodes = await database
    .select()
    .from(schema.episodes)
    .where(inArray(schema.episodes.showId, candidateShowIds))

  const staleFlags = await Promise.all(
    candidateEpisodes.map(
      async (episode) => !(await pathIsReadable(episode.filePath))
    )
  )

  const staleEpisodes: Episode[] = []
  const survivingEpisodes: Episode[] = []

  for (const [index, episode] of candidateEpisodes.entries()) {
    if (staleFlags[index] === true) {
      staleEpisodes.push(episode)
    } else {
      survivingEpisodes.push(episode)
    }
  }

  if (staleEpisodes.length === 0) {
    return { removedEpisodes: 0, removedSeasons: 0, removedShows: 0 }
  }

  // Map every surviving episode under each identity of its show, so a stale
  // episode can find its replacement by (identity, season, episode) even
  // when the replacement row belongs to a different show row. Episodes of
  // freshly scanned shows win over other survivors.
  const survivorsByKey = new Map<string, SurvivorEntry>()

  for (const episode of survivingEpisodes) {
    const show = showsById.get(episode.showId)

    if (!show) {
      continue
    }

    const fromScannedShow = scannedShowIdSet.has(show.id)

    for (const identityKey of identityKeysOf(show)) {
      const key = `${identityKey}|${episode.seasonNumber}|${episode.episodeNumber}`
      const current = survivorsByKey.get(key)

      if (!current || (!current.fromScannedShow && fromScannedShow)) {
        survivorsByKey.set(key, { episodeId: episode.id, fromScannedShow })
      }
    }
  }

  const carryOverPairs: Array<{
    staleEpisodeId: number
    survivorEpisodeId: number
  }> = []

  for (const episode of staleEpisodes) {
    const show = showsById.get(episode.showId)

    if (!show) {
      continue
    }

    for (const identityKey of identityKeysOf(show)) {
      const key = `${identityKey}|${episode.seasonNumber}|${episode.episodeNumber}`
      const survivor = survivorsByKey.get(key)

      if (survivor) {
        carryOverPairs.push({
          staleEpisodeId: episode.id,
          survivorEpisodeId: survivor.episodeId
        })
        break
      }
    }
  }

  // Shows that keep at least one episode survive; empty ones get merged into
  // an identity mate (favorites re-pointed) and deleted.
  const survivingShowIds = new Set(
    survivingEpisodes.map((episode) => episode.showId)
  )

  const showSurvivorByKey = new Map<string, number>()

  for (const show of allShows) {
    if (!survivingShowIds.has(show.id)) {
      continue
    }

    for (const identityKey of identityKeysOf(show)) {
      const current = showSurvivorByKey.get(identityKey)
      const currentIsScanned =
        current !== undefined && scannedShowIdSet.has(current)

      if (current === undefined || (!currentIsScanned && scannedShowIdSet.has(show.id))) {
        showSurvivorByKey.set(identityKey, show.id)
      }
    }
  }

  const staleEpisodeIds = staleEpisodes.map((episode) => episode.id)

  let removedSeasons = 0
  let removedShows = 0

  // All fs checks are done; the mutation plan runs in one synchronous
  // transaction (the sync SQLite driver requires a sync callback), so a
  // crash mid-reconcile leaves the database unchanged.
  database.transaction((tx) => {
    for (const pair of carryOverPairs) {
      const staleProgressRows = tx
        .select()
        .from(schema.watchProgress)
        .where(eq(schema.watchProgress.episodeId, pair.staleEpisodeId))
        .all()

      for (const staleRow of staleProgressRows) {
        const [existing] = tx
          .select()
          .from(schema.watchProgress)
          .where(
            and(
              eq(schema.watchProgress.profileId, staleRow.profileId),
              eq(schema.watchProgress.episodeId, pair.survivorEpisodeId)
            )
          )
          .all()

        if (!existing) {
          tx.update(schema.watchProgress)
            .set({ episodeId: pair.survivorEpisodeId })
            .where(eq(schema.watchProgress.id, staleRow.id))
            .run()
        } else if (staleRow.updatedAt.getTime() > existing.updatedAt.getTime()) {
          // The user watched further at the old location; the stale row
          // itself is removed by the episode-delete cascade below.
          tx.update(schema.watchProgress)
            .set({
              currentTime: staleRow.currentTime,
              duration: staleRow.duration,
              updatedAt: staleRow.updatedAt
            })
            .where(eq(schema.watchProgress.id, existing.id))
            .run()
        }
      }
    }

    // Children first: the seasons/episodes foreign keys don't cascade.
    tx.delete(schema.episodes)
      .where(inArray(schema.episodes.id, staleEpisodeIds))
      .run()

    const emptySeasons = tx
      .select({ id: schema.seasons.id })
      .from(schema.seasons)
      .where(
        and(
          inArray(schema.seasons.showId, candidateShowIds),
          notInArray(
            schema.seasons.id,
            tx
              .select({ id: schema.episodes.seasonId })
              .from(schema.episodes)
          )
        )
      )
      .all()

    if (emptySeasons.length > 0) {
      tx.delete(schema.seasons)
        .where(
          inArray(
            schema.seasons.id,
            emptySeasons.map((season) => season.id)
          )
        )
        .run()

      removedSeasons = emptySeasons.length
    }

    const remainingSeasons = tx
      .select({ id: schema.seasons.id })
      .from(schema.seasons)
      .where(inArray(schema.seasons.showId, candidateShowIds))
      .all()

    for (const season of remainingSeasons) {
      const [episodeCountRow] = tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.episodes)
        .where(eq(schema.episodes.seasonId, season.id))
        .all()

      tx.update(schema.seasons)
        .set({ episodeCount: episodeCountRow?.count ?? 0 })
        .where(eq(schema.seasons.id, season.id))
        .run()
    }

    for (const show of candidateShows) {
      const [remainingRow] = tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.episodes)
        .where(eq(schema.episodes.showId, show.id))
        .all()

      if ((remainingRow?.count ?? 0) > 0) {
        continue
      }

      const survivorShowId = identityKeysOf(show)
        .map((identityKey) => showSurvivorByKey.get(identityKey))
        .find(
          (candidateId): candidateId is number =>
            candidateId !== undefined && candidateId !== show.id
        )

      if (survivorShowId !== undefined) {
        const staleFavorites = tx
          .select()
          .from(schema.favorites)
          .where(eq(schema.favorites.showId, show.id))
          .all()

        for (const favorite of staleFavorites) {
          const [existingFavorite] = tx
            .select()
            .from(schema.favorites)
            .where(
              and(
                eq(schema.favorites.profileId, favorite.profileId),
                eq(schema.favorites.showId, survivorShowId)
              )
            )
            .all()

          // On conflict the stale favorite is simply left to cascade away
          // with the show delete below.
          if (!existingFavorite) {
            tx.update(schema.favorites)
              .set({ showId: survivorShowId })
              .where(eq(schema.favorites.id, favorite.id))
              .run()
          }
        }
      }

      tx.delete(schema.seasons)
        .where(eq(schema.seasons.showId, show.id))
        .run()

      tx.delete(schema.shows).where(eq(schema.shows.id, show.id)).run()

      removedShows++
    }
  })

  return {
    removedEpisodes: staleEpisodeIds.length,
    removedSeasons,
    removedShows
  }
}
