import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import { streamer, subscription } from '#/db/schema'
import { auth } from '#/lib/auth'
import {
  getCurrentUser,
  getFollowedChannels,
  getUserByLogin,
  getUsersByIds,
  type TwitchUser,
} from '#/lib/twitch'

/** Resolve the current user's id + (auto-refreshed) Twitch access token. */
async function requireTwitchAuth() {
  const { headers } = getRequest()
  const session = await auth.api.getSession({ headers })
  if (!session) throw new Error('Unauthorized')
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: 'twitch', userId: session.user.id },
    headers,
  })
  return { userId: session.user.id, accessToken }
}

/** Upsert streamer rows; returns their db ids. */
async function upsertStreamers(users: Array<TwitchUser>) {
  if (users.length === 0) return [] as Array<number>
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
        login: streamer.login,
        displayName: streamer.displayName,
        profileImageUrl: streamer.profileImageUrl,
        broadcasterType: streamer.broadcasterType,
      },
    })
    .returning({ id: streamer.id })
  return rows.map((r) => r.id)
}

async function subscribe(userId: string, streamerIds: Array<number>) {
  if (streamerIds.length === 0) return
  await db
    .insert(subscription)
    .values(streamerIds.map((streamerId) => ({ userId, streamerId })))
    .onConflictDoNothing()
}

/** Streamer catalog with the current user's subscribed flag. */
export const listStreamers = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')
    const userId = session.user.id

    const rows = await db
      .select({
        id: streamer.id,
        twitchUserId: streamer.twitchUserId,
        login: streamer.login,
        displayName: streamer.displayName,
        profileImageUrl: streamer.profileImageUrl,
        broadcasterType: streamer.broadcasterType,
        subscribed: sql<boolean>`${subscription.id} is not null`,
        category: subscription.category,
      })
      .from(streamer)
      .leftJoin(
        subscription,
        and(
          eq(subscription.streamerId, streamer.id),
          eq(subscription.userId, userId),
        ),
      )
      .orderBy(streamer.displayName)
    return rows
  },
)

export const importFollows = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { userId, accessToken } = await requireTwitchAuth()
    const me = await getCurrentUser(accessToken)
    const followed = await getFollowedChannels(accessToken, me.id)
    const users = await getUsersByIds(
      accessToken,
      followed.map((f) => f.broadcaster_id),
    )
    const ids = await upsertStreamers(users)
    await subscribe(userId, ids)
    return { imported: ids.length }
  },
)

export const addStreamerByLogin = createServerFn({ method: 'POST' })
  .validator((login: string) => login.trim().toLowerCase())
  .handler(async ({ data: login }) => {
    const { userId, accessToken } = await requireTwitchAuth()
    const user = await getUserByLogin(accessToken, login)
    if (!user) throw new Error(`No Twitch user "${login}"`)
    const ids = await upsertStreamers([user])
    await subscribe(userId, ids)
    return { added: user.display_name }
  })

export const setSubscribed = createServerFn({ method: 'POST' })
  .validator((input: { id: number; subscribed: boolean }) => input)
  .handler(async ({ data }) => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')
    const userId = session.user.id

    if (data.subscribed) {
      await subscribe(userId, [data.id])
    } else {
      await db
        .delete(subscription)
        .where(
          and(
            eq(subscription.userId, userId),
            eq(subscription.streamerId, data.id),
          ),
        )
    }
    return { ok: true }
  })

export const setStreamerCategory = createServerFn({ method: 'POST' })
  .validator((input: { streamerId: number; category: string | null }) => input)
  .handler(async ({ data }) => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')
    const category = data.category?.trim() || null
    await db
      .update(subscription)
      .set({ category })
      .where(
        and(
          eq(subscription.userId, session.user.id),
          eq(subscription.streamerId, data.streamerId),
        ),
      )
    return { ok: true }
  })

export const setAllSubscribed = createServerFn({ method: 'POST' })
  .validator((subscribed: boolean) => subscribed)
  .handler(async ({ data: subscribed }) => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')
    const userId = session.user.id

    if (subscribed) {
      const all = await db.select({ id: streamer.id }).from(streamer)
      await subscribe(
        userId,
        all.map((s) => s.id),
      )
    } else {
      await db.delete(subscription).where(eq(subscription.userId, userId))
    }
    return { ok: true }
  })
