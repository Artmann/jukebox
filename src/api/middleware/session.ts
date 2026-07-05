import { HttpServerRequest } from '@effect/platform'
import { eq, lt } from 'drizzle-orm'
import { Effect, Ref } from 'effect'

import type { DrizzleDatabase } from '../../database/layer'
import * as schema from '../../database/schema'
import { InternalError, Unauthorized } from '../contract/errors'
import { sessionCookieName } from '../handlers/auth'
import { internalTryPromise } from '../handlers/support'

const lastSeenThrottleMs = 60 * 1000
const sweepIntervalMs = 5 * 60 * 1000

// The session check shared by AuthMiddleware (HttpApi groups) and the raw
// streaming routes, which sit outside the HttpApi and must apply auth
// themselves. Passes through untouched when no password is configured.
//
// `lastSweepAtRef` throttles the expired-session sweep; each caller owns one
// Ref, created when its layer is built.
export const makeSessionCheck = (
  db: DrizzleDatabase,
  lastSweepAtRef: Ref.Ref<number>
): Effect.Effect<
  void,
  InternalError | Unauthorized,
  HttpServerRequest.HttpServerRequest
> => {
  const sweepExpiredSessions = (now: number) =>
    Effect.gen(function* () {
      const lastSweepAt = yield* Ref.get(lastSweepAtRef)

      if (now - lastSweepAt < sweepIntervalMs) {
        return
      }

      yield* Ref.set(lastSweepAtRef, now)

      yield* internalTryPromise(() =>
        db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now))
      )
    })

  return Effect.gen(function* () {
    const [config] = yield* internalTryPromise(() =>
      db
        .select()
        .from(schema.authConfig)
        .where(eq(schema.authConfig.id, 1))
        .limit(1)
    )

    if (!config || config.passwordHash === null) {
      return
    }

    const request = yield* HttpServerRequest.HttpServerRequest
    const token = request.cookies[sessionCookieName]

    if (!token) {
      return yield* Effect.fail(
        new Unauthorized({ message: 'Authentication required.' })
      )
    }

    const [session] = yield* internalTryPromise(() =>
      db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, token))
        .limit(1)
    )

    const now = Date.now()

    if (!session || session.expiresAt <= now) {
      if (session) {
        yield* internalTryPromise(() =>
          db.delete(schema.sessions).where(eq(schema.sessions.id, session.id))
        )
      }

      return yield* Effect.fail(
        new Unauthorized({
          message: 'Your session has expired. Please sign in again.'
        })
      )
    }

    yield* sweepExpiredSessions(now)

    if (now - session.lastSeenAt > lastSeenThrottleMs) {
      yield* internalTryPromise(() =>
        db
          .update(schema.sessions)
          .set({ lastSeenAt: now })
          .where(eq(schema.sessions.id, session.id))
      )
    }
  })
}
