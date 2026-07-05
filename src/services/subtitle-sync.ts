import { eq } from 'drizzle-orm'

import type { DrizzleDatabase } from '../database/layer'
import * as schema from '../database/schema'
import type { NewSubtitle } from '../database/schema'
import type { DiscoveredSubtitle } from './subtitles'

/**
 * Replace the subtitle rows attached to a movie with the freshly discovered
 * sidecars. We delete-and-reinsert rather than diffing so a renamed or
 * removed sidecar disappears on the next scan without bookkeeping.
 */
export async function syncSubtitlesForMovie(
  database: DrizzleDatabase,
  movieId: number,
  discovered: DiscoveredSubtitle[]
): Promise<void> {
  if (discovered.length === 0) {
    await database
      .delete(schema.subtitles)
      .where(eq(schema.subtitles.movieId, movieId))

    return
  }

  const rows: NewSubtitle[] = discovered.map((subtitle) => ({
    movieId,
    episodeId: null,
    filePath: subtitle.filePath,
    format: subtitle.format,
    language: subtitle.language
  }))

  await database
    .delete(schema.subtitles)
    .where(eq(schema.subtitles.movieId, movieId))

  await database.insert(schema.subtitles).values(rows)
}

/**
 * Same as syncSubtitlesForMovie but for episodes. See note above.
 */
export async function syncSubtitlesForEpisode(
  database: DrizzleDatabase,
  episodeId: number,
  discovered: DiscoveredSubtitle[]
): Promise<void> {
  if (discovered.length === 0) {
    await database
      .delete(schema.subtitles)
      .where(eq(schema.subtitles.episodeId, episodeId))

    return
  }

  const rows: NewSubtitle[] = discovered.map((subtitle) => ({
    movieId: null,
    episodeId,
    filePath: subtitle.filePath,
    format: subtitle.format,
    language: subtitle.language
  }))

  await database
    .delete(schema.subtitles)
    .where(eq(schema.subtitles.episodeId, episodeId))

  await database.insert(schema.subtitles).values(rows)
}
