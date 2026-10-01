import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { authMiddleware } from '#/features/auth/middleware'
import { auth } from '#/server/auth'
import { db } from '#/server/db'
import { streamer, subscription } from '#/server/db/schema'
import {
  getAuthenticatedUser,
  getFollowedChannelIds,
  getUserByLogin,
  getUsersByIds,
} from '#/server/twitch/helix'
import type { TwitchUser } from '#/server/twitch/helix'

/** The user's Twitch access token. Better Auth refreshes it when expired. */
async function twitchAccessToken(userId: string) {
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: 'twitch', userId },
    headers: getRequest().headers,
  })
  return accessToken
}

/** Upserts channels into the shared catalog and returns their ids. */
async function upsertStreamers(users: Array<TwitchUser>): Promise<Array<number>> {
  if (users.length === 0) return []
  const rows = await db
    .insert(streamer)
    .values(
      users.map((u) => ({
        twitchUserId: u.id,
        login: u.login,
        displayName: u.display_name,
        profileImageUrl: u.profile_image_url,
        broadcasterType: u.broadcaster_type,
      })),
    )
    .onConflictDoUpdate({
      target: streamer.twitchUserId,
      set: {
        login: sql`excluded.login`,
        displayName: sql`excluded.display_name`,
        profileImageUrl: sql`excluded.profile_image_url`,
        broadcasterType: sql`excluded.broadcaster_type`,
      },
    })
    .returning({ id: streamer.id })
  return rows.map((r) => r.id)
}

/** The user's library: every streamer they've imported or added. */
export const listStreamers = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) =>
    db
      .select({
        id: streamer.id,
        displayName: streamer.displayName,
        profileImageUrl: streamer.profileImageUrl,
        broadcasterType: streamer.broadcasterType,
        enabled: subscription.enabled,
        category: subscription.category,
      })
      .from(subscription)
      .innerJoin(streamer, eq(streamer.id, subscription.streamerId))
      .where(eq(subscription.userId, context.user.id))
      .orderBy(streamer.displayName),
  )

/**
 * Adds every channel the user follows on Twitch to their library. Channels
 * already in the library keep their current enabled state.
 */
export const importFollows = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const token = await twitchAccessToken(context.user.id)
    const me = await getAuthenticatedUser(token)
    const channels = await getUsersByIds(token, await getFollowedChannelIds(token, me.id))
    const ids = await upsertStreamers(channels)
    if (ids.length > 0) {
      await db
        .insert(subscription)
        .values(ids.map((streamerId) => ({ userId: context.user.id, streamerId })))
        .onConflictDoNothing()
    }
    return { imported: ids.length }
  })

export const addStreamer = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{1,25}$/, 'Not a valid Twitch login'),
  )
  .handler(async ({ data: login, context }) => {
    const token = await twitchAccessToken(context.user.id)
    const channel = await getUserByLogin(token, login)
    if (!channel) throw new Error(`No Twitch channel named "${login}"`)
    const [streamerId] = await upsertStreamers([channel])
    await db
      .insert(subscription)
      .values({ userId: context.user.id, streamerId })
      .onConflictDoUpdate({
        target: [subscription.userId, subscription.streamerId],
        set: { enabled: true },
      })
    return { added: channel.display_name }
  })

export const setStreamerEnabled = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ streamerId: z.number().int().positive(), enabled: z.boolean() }))
  .handler(async ({ data, context }) => {
    await db
      .update(subscription)
      .set({ enabled: data.enabled })
      .where(
        and(
          eq(subscription.userId, context.user.id),
          eq(subscription.streamerId, data.streamerId),
        ),
      )
  })

export const disableAllStreamers = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await db
      .update(subscription)
      .set({ enabled: false })
      .where(eq(subscription.userId, context.user.id))
  })

export const setStreamerCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      streamerId: z.number().int().positive(),
      category: z.string().trim().max(40).nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    await db
      .update(subscription)
      .set({ category: data.category || null })
      .where(
        and(
          eq(subscription.userId, context.user.id),
          eq(subscription.streamerId, data.streamerId),
        ),
      )
  })
