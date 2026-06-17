import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { streamer } from '#/db/schema'
import { auth } from '#/lib/auth'
import {
  getCurrentUser,
  getFollowedChannels,
  getUserByLogin,
  getUsersByIds,
  type TwitchUser,
} from '#/lib/twitch'

/** Resolve the current user's (auto-refreshed) Twitch access token. */
async function requireTwitchToken() {
  const { headers } = getRequest()
  const session = await auth.api.getSession({ headers })
  if (!session) throw new Error('Unauthorized')
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: 'twitch', userId: session.user.id },
    headers,
  })
  return accessToken
}

async function upsertStreamers(users: Array<TwitchUser>) {
  if (users.length === 0) return 0
  await db
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
    // Refresh mutable metadata; preserve `subscribed` and `retentionOverride`.
    .onConflictDoUpdate({
      target: streamer.twitchUserId,
      set: {
        login: streamer.login,
        displayName: streamer.displayName,
        profileImageUrl: streamer.profileImageUrl,
        broadcasterType: streamer.broadcasterType,
      },
    })
  return users.length
}

export const listStreamers = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db.select().from(streamer).orderBy(streamer.displayName)
  },
)

export const importFollows = createServerFn({ method: 'POST' }).handler(
  async () => {
    const token = await requireTwitchToken()
    const me = await getCurrentUser(token)
    const followed = await getFollowedChannels(token, me.id)
    const users = await getUsersByIds(
      token,
      followed.map((f) => f.broadcaster_id),
    )
    const imported = await upsertStreamers(users)
    return { imported }
  },
)

export const addStreamerByLogin = createServerFn({ method: 'POST' })
  .validator((login: string) => login.trim().toLowerCase())
  .handler(async ({ data: login }) => {
    const token = await requireTwitchToken()
    const user = await getUserByLogin(token, login)
    if (!user) throw new Error(`No Twitch user "${login}"`)
    await upsertStreamers([user])
    return { added: user.display_name }
  })

export const setSubscribed = createServerFn({ method: 'POST' })
  .validator((input: { id: number; subscribed: boolean }) => input)
  .handler(async ({ data }) => {
    await db
      .update(streamer)
      .set({ subscribed: data.subscribed })
      .where(eq(streamer.id, data.id))
    return { ok: true }
  })

export const setAllSubscribed = createServerFn({ method: 'POST' })
  .validator((subscribed: boolean) => subscribed)
  .handler(async ({ data: subscribed }) => {
    await db.update(streamer).set({ subscribed })
    return { ok: true }
  })
