import { Effect, Layer, Ref } from 'effect'

import { Database } from '../../database/layer'
import { AuthMiddleware } from '../contract/middleware'
import { makeSessionCheck } from './session'

// Ports src/api/middleware/auth.ts via the shared session check in
// ./session.ts. The module-level `lastSweepAt` becomes a Ref created once
// when the middleware layer is built. The /api/auth and /api/setup
// pass-throughs are not needed here — the middleware simply isn't attached
// to those groups (see src/api/contract/middleware.ts).
export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const db = yield* Database
    const lastSweepAtRef = yield* Ref.make(0)

    return makeSessionCheck(db, lastSweepAtRef)
  })
)
