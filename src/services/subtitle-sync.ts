import { eq } from 'drizzle-orm'

import { db, schema } from '../database'
import type { NewSubtitle } from '../database/schema'
import type { DiscoveredSubtitle } from './subtitles'

/**
 * Replace the subtitle rows attached to a movie with the freshly discovered
 * sidecars. We delete-and-reinsert rather than diffing so a renamed or
 * removed sidecar disappears on the next scan without bookkeeping.
 */
export async function syncSubtitlesForMovie(
  movieId: number,
  discovered: DiscoveredSubtitle[]
): Promise<void> {
  await db
    .delete(schema.subtitles)
    .where(eq(schema.subtitles.movieId, movieId))

  if (discovered.length === 0) {
    return
  }

  const rows: NewSubtitle[] = discovered.map((subtitle) => ({
    movieId,
    episodeId: null,
    filePath: subtitle.filePath,
    format: subtitle.format,
    language: subtitle.language
  }))

  await db.insert(schema.subtitles).values(rows)
}

/**
 * Same as syncSubtitlesForMovie but for episodes. See note above.
 */
export async function syncSubtitlesForEpisode(
  episodeId: number,
  discovered: DiscoveredSubtitle[]
): Promise<void> {
  await db
    .delete(schema.subtitles)
    .where(eq(schema.subtitles.episodeId, episodeId))

  if (discovered.length === 0) {
    return
  }

  const rows: NewSubtitle[] = discovered.map((subtitle) => ({
    movieId: null,
    episodeId,
    filePath: subtitle.filePath,
    format: subtitle.format,
    language: subtitle.language
  }))

  await db.insert(schema.subtitles).values(rows)
}
