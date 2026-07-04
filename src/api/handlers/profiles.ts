import { HttpApiBuilder } from '@effect/platform'
import { desc, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from '../../database/layer'
import * as schema from '../../database/schema'
import { jukeboxApi } from '../contract'
import { BadRequest, NotFound } from '../contract/errors'
import { CurrentProfile } from '../contract/middleware'
import { appendProfileCookie } from '../middleware/profile-effect'

import {
  errorMessage,
  internalTryPromise,
  serializeProfile,
  withInternalFallback
} from './support'

// Ports src/api/routes/profiles.ts. The routes' 400s for insert/update
// failures (UNIQUE name collisions and everything else) stay 400s here.
export const profilesHandlersLive = HttpApiBuilder.group(
  jukeboxApi,
  'profiles',
  (handlers) =>
    handlers
      .handle('listProfiles', () =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const profiles = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.profiles)
                .orderBy(desc(schema.profiles.createdAt))
            )

            return profiles.map(serializeProfile)
          })
        )
      )
      .handle('getActiveProfile', () =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const { id: profileId } = yield* CurrentProfile

            const [profile] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.profiles)
                .where(eq(schema.profiles.id, profileId))
                .limit(1)
            )

            if (!profile) {
              return yield* Effect.fail(
                new NotFound({ message: 'Active profile not found' })
              )
            }

            return serializeProfile(profile)
          })
        )
      )
      .handle('createProfile', ({ payload }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const name = payload.name?.trim()
            const emoji = payload.emoji?.trim()

            if (!name || !emoji) {
              return yield* Effect.fail(
                new BadRequest({ message: 'name and emoji are required' })
              )
            }

            const now = new Date()

            const [created] = yield* Effect.tryPromise({
              catch: (error) =>
                new BadRequest({
                  message: errorMessage(error).includes('UNIQUE')
                    ? 'A profile with that name already exists'
                    : 'Failed to create profile'
                }),
              try: () =>
                db
                  .insert(schema.profiles)
                  .values({ name, emoji, createdAt: now })
                  .returning()
            })

            if (!created) {
              return yield* Effect.fail(
                new BadRequest({ message: 'Failed to create profile' })
              )
            }

            return serializeProfile(created)
          })
        )
      )
      .handle('updateProfile', ({ path, payload }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database
            const updates: Partial<schema.NewProfile> = {}

            if (typeof payload.name === 'string' && payload.name.trim()) {
              updates.name = payload.name.trim()
            }

            if (typeof payload.emoji === 'string' && payload.emoji.trim()) {
              updates.emoji = payload.emoji.trim()
            }

            if (Object.keys(updates).length === 0) {
              return yield* Effect.fail(
                new BadRequest({ message: 'Nothing to update' })
              )
            }

            const [updated] = yield* Effect.tryPromise({
              catch: (error) =>
                new BadRequest({
                  message: errorMessage(error).includes('UNIQUE')
                    ? 'A profile with that name already exists'
                    : 'Failed to update profile'
                }),
              try: () =>
                db
                  .update(schema.profiles)
                  .set(updates)
                  .where(eq(schema.profiles.id, path.id))
                  .returning()
            })

            if (!updated) {
              return yield* Effect.fail(
                new NotFound({ message: 'Profile not found' })
              )
            }

            return serializeProfile(updated)
          })
        )
      )
      .handle('deleteProfile', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const all = yield* internalTryPromise(() =>
              db.select({ id: schema.profiles.id }).from(schema.profiles)
            )

            if (all.length <= 1) {
              return yield* Effect.fail(
                new BadRequest({
                  message: 'Cannot delete the last remaining profile'
                })
              )
            }

            yield* internalTryPromise(() =>
              db.delete(schema.profiles).where(eq(schema.profiles.id, path.id))
            )

            const { id: activeId } = yield* CurrentProfile

            if (activeId === path.id) {
              const next = all.find((profile) => profile.id !== path.id)

              if (next) {
                yield* appendProfileCookie(next.id)
              }
            }

            return { success: true }
          })
        )
      )
      .handle('activateProfile', ({ path }) =>
        withInternalFallback(
          Effect.gen(function* () {
            const db = yield* Database

            const [profile] = yield* internalTryPromise(() =>
              db
                .select()
                .from(schema.profiles)
                .where(eq(schema.profiles.id, path.id))
                .limit(1)
            )

            if (!profile) {
              return yield* Effect.fail(
                new NotFound({ message: 'Profile not found' })
              )
            }

            yield* appendProfileCookie(profile.id)

            return serializeProfile(profile)
          })
        )
      )
)
