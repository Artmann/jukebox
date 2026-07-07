import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { InternalError } from '../contract/errors'

import { internalTryPromise } from './support'

type WatchProgressTarget =
  | { column: 'episodeId'; mediaId: number }
  | { column: 'movieId'; mediaId: number }

function watchProgressFilter(profileId: number, target: WatchProgressTarget) {
  const mediaFilter =
    target.column === 'movieId'
      ? eq(schema.watchProgress.movieId, target.mediaId)
      : eq(schema.watchProgress.episodeId, target.mediaId)

  return and(eq(schema.watchProgress.profileId, profileId), mediaFilter)
}

export function getWatchProgressEffect(
  profileId: number,
  target: WatchProgressTarget
): Effect.Effect<
  { currentTime: number; duration: number | null },
  InternalError,
  Database
> {
  return Effect.gen(function* () {
    const db = yield* Database

    const [progress] = yield* internalTryPromise(() =>
      db
        .select()
        .from(schema.watchProgress)
        .where(watchProgressFilter(profileId, target))
        .limit(1)
    )

    if (!progress) {
      return { currentTime: 0, duration: null }
    }

    return {
      currentTime: progress.currentTime,
      duration: progress.duration
    }
  })
}

export interface SaveWatchProgressPayload {
  currentTime: number
  duration?: number | null
}

export function saveWatchProgressEffect(
  profileId: number,
  target: WatchProgressTarget,
  payload: SaveWatchProgressPayload
): Effect.Effect<{ success: true }, InternalError, Database> {
  return Effect.gen(function* () {
    const db = yield* Database

    const [existing] = yield* internalTryPromise(() =>
      db
        .select()
        .from(schema.watchProgress)
        .where(watchProgressFilter(profileId, target))
        .limit(1)
    )

    const now = new Date()
    const currentTime = Math.floor(payload.currentTime)
    const duration = payload.duration ? Math.floor(payload.duration) : null

    if (existing) {
      yield* internalTryPromise(() =>
        db
          .update(schema.watchProgress)
          .set({
            currentTime,
            duration: duration ?? existing.duration,
            updatedAt: now
          })
          .where(eq(schema.watchProgress.id, existing.id))
      )
    } else if (target.column === 'movieId') {
      yield* internalTryPromise(() =>
        db.insert(schema.watchProgress).values({
          profileId,
          movieId: target.mediaId,
          currentTime,
          duration,
          updatedAt: now
        })
      )
    } else {
      yield* internalTryPromise(() =>
        db.insert(schema.watchProgress).values({
          profileId,
          episodeId: target.mediaId,
          currentTime,
          duration,
          updatedAt: now
        })
      )
    }

    return { success: true }
  })
}
