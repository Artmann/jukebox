import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db, schema } from '../../database'
import {
  setProfileCookie,
  type ProfileContext
} from '../middleware/profile'

const profileRoutes = new Hono<ProfileContext>()

profileRoutes.get('/', async (context) => {
  const profiles = await db
    .select()
    .from(schema.profiles)
    .orderBy(desc(schema.profiles.createdAt))

  return context.json(profiles)
})

profileRoutes.get('/active', async (context) => {
  const profileId = context.get('profileId')

  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId))
    .limit(1)

  if (!profile) {
    return context.json({ error: { message: 'Active profile not found' } }, 404)
  }

  return context.json(profile)
})

profileRoutes.post('/', async (context) => {
  const body = await context.req.json<{ name?: string; emoji?: string }>()
  const name = body.name?.trim()
  const emoji = body.emoji?.trim()

  if (!name || !emoji) {
    return context.json(
      { error: { message: 'name and emoji are required' } },
      400
    )
  }

  const now = new Date()

  try {
    const [created] = await db
      .insert(schema.profiles)
      .values({ name, emoji, createdAt: now })
      .returning()

    return context.json(created, 201)
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('UNIQUE')
        ? 'A profile with that name already exists'
        : 'Failed to create profile'

    return context.json({ error: { message } }, 400)
  }
})

profileRoutes.patch('/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: { message: 'Invalid profile id' } }, 400)
  }

  const body = await context.req.json<{ name?: string; emoji?: string }>()
  const updates: Partial<schema.NewProfile> = {}

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim()
  }

  if (typeof body.emoji === 'string' && body.emoji.trim()) {
    updates.emoji = body.emoji.trim()
  }

  if (Object.keys(updates).length === 0) {
    return context.json(
      { error: { message: 'Nothing to update' } },
      400
    )
  }

  try {
    const [updated] = await db
      .update(schema.profiles)
      .set(updates)
      .where(eq(schema.profiles.id, id))
      .returning()

    if (!updated) {
      return context.json({ error: { message: 'Profile not found' } }, 404)
    }

    return context.json(updated)
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('UNIQUE')
        ? 'A profile with that name already exists'
        : 'Failed to update profile'

    return context.json({ error: { message } }, 400)
  }
})

profileRoutes.delete('/:id', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: { message: 'Invalid profile id' } }, 400)
  }

  const all = await db.select({ id: schema.profiles.id }).from(schema.profiles)

  if (all.length <= 1) {
    return context.json(
      { error: { message: 'Cannot delete the last remaining profile' } },
      400
    )
  }

  await db.delete(schema.profiles).where(eq(schema.profiles.id, id))

  const activeId = context.get('profileId')

  if (activeId === id) {
    const next = all.find((profile) => profile.id !== id)

    if (next) {
      setProfileCookie(context, next.id)
    }
  }

  return context.json({ success: true })
})

profileRoutes.post('/:id/activate', async (context) => {
  const id = parseInt(context.req.param('id'), 10)

  if (isNaN(id)) {
    return context.json({ error: { message: 'Invalid profile id' } }, 400)
  }

  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, id))
    .limit(1)

  if (!profile) {
    return context.json({ error: { message: 'Profile not found' } }, 404)
  }

  setProfileCookie(context, profile.id)

  return context.json(profile)
})

export { profileRoutes }
