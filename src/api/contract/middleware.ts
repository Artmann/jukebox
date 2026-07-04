import { HttpApiMiddleware } from '@effect/platform'
import { Context, Schema } from 'effect'

import { InternalErrorWire, UnauthorizedWire } from './errors'

// The active profile for the current request, resolved from the
// `jukebox_profile_id` cookie (falling back to the newest profile, created on
// demand) by ProfileMiddleware. Handlers read it with `yield* CurrentProfile`.
export class CurrentProfile extends Context.Tag('jukebox/CurrentProfile')<
  CurrentProfile,
  { readonly id: number }
>() {}

// Session-cookie authentication mirroring src/api/middleware/auth.ts. It is a
// plain HttpApiMiddleware (not HttpApiSecurity) because requests must pass
// through untouched when no password is configured. The failure union lets
// database errors surface as today's `{ error: { message } }` 500 instead of
// an unhandled defect.
//
// Attachment parity with Hono's `app.use('/api/*', ...)`: every group except
// `auth` and `setup` (those paths are skipped today), and every hello endpoint
// except `root` — `/api/*` never matched `/api` itself, so the root endpoint
// stays unauthenticated.
export class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()(
  'jukebox/AuthMiddleware',
  { failure: Schema.Union(InternalErrorWire, UnauthorizedWire) }
) {}

// Resolves the active profile and sets the profile cookie when it was missing
// or stale, mirroring src/api/middleware/profile.ts. Attached everywhere
// AuthMiddleware is, plus the `auth` and `setup` groups (Hono ran it on all
// of /api/*).
export class ProfileMiddleware extends HttpApiMiddleware.Tag<ProfileMiddleware>()(
  'jukebox/ProfileMiddleware',
  { failure: InternalErrorWire, provides: CurrentProfile }
) {}
