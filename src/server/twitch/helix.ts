// Client for Twitch's official Helix API.
//
// Two kinds of token:
// - App access token (client-credentials): public data such as VODs, live
//   status and chat badges. Managed here; callers never see it.
// - User access token (OAuth): data that needs the user's permission, i.e.
//   their followed channels. Passed in by the caller.
import { env } from '#/server/env'

const HELIX = 'https://api.twitch.tv/helix'
const PAGE_SIZE = 100 // Helix maximum for `first` and for repeated id params

export class HelixError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface HelixPage<T> {
  data: Array<T>
  pagination?: { cursor?: string }
}

async function helixGet<T>(
  path: string,
  token: string,
  params: Record<string, string | Array<string>> = {},
): Promise<HelixPage<T>> {
  const url = new URL(HELIX + path)
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, v)
    }
  }
  const res = await fetch(url, {
    headers: {
      'Client-Id': env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new HelixError(res.status, `Twitch ${path} ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<HelixPage<T>>
}

function chunk<T>(items: Array<T>, size = PAGE_SIZE): Array<Array<T>> {
  const out: Array<Array<T>> = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ── App access token ─────────────────────────────────────────────────────

let appToken: { value: string; expiresAt: number } | null = null

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    throw new Error(`Twitch app token ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  appToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return appToken.value
}

// Runs a request with the app token. If Twitch rejects the cached token
// (revoked early), drop it and retry once with a fresh one.
async function withAppToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await getAppToken())
  } catch (err) {
    if (!(err instanceof HelixError) || err.status !== 401) throw err
    appToken = null
    return fn(await getAppToken())
  }
}

// ── Users and follows (user token) ───────────────────────────────────────

export interface TwitchUser {
  id: string
  login: string
  display_name: string
  profile_image_url: string
  broadcaster_type: '' | 'affiliate' | 'partner'
}

/** The account that owns the given user token. */
export async function getAuthenticatedUser(token: string): Promise<TwitchUser> {
  const { data } = await helixGet<TwitchUser>('/users', token)
  if (!data[0]) throw new Error('Twitch /users returned no user')
  return data[0]
}

export async function getUserByLogin(
  token: string,
  login: string,
): Promise<TwitchUser | null> {
  const { data } = await helixGet<TwitchUser>('/users', token, { login })
  return data[0] ?? null
}

export async function getUsersByIds(
  token: string,
  ids: Array<string>,
): Promise<Array<TwitchUser>> {
  const users: Array<TwitchUser> = []
  for (const batch of chunk(ids)) {
    const { data } = await helixGet<TwitchUser>('/users', token, { id: batch })
    users.push(...data)
  }
  return users
}

/** Ids of every channel the user follows (follows all pages). */
export async function getFollowedChannelIds(
  token: string,
  userId: string,
): Promise<Array<string>> {
  const ids: Array<string> = []
  let cursor: string | undefined
  do {
    const params: Record<string, string> = {
      user_id: userId,
      first: String(PAGE_SIZE),
    }
    if (cursor) params.after = cursor
    const page = await helixGet<{ broadcaster_id: string }>(
      '/channels/followed',
      token,
      params,
    )
    ids.push(...page.data.map((f) => f.broadcaster_id))
    cursor = page.pagination?.cursor
  } while (cursor)
  return ids
}

// ── VODs and live status (app token) ─────────────────────────────────────

export interface TwitchVideo {
  id: string
  stream_id: string | null
  title: string
  created_at: string
  published_at: string
  thumbnail_url: string
  duration: string // e.g. "3h20m31s"
}

/** A channel's most recent archived broadcasts, newest first. */
export function getArchiveVideos(
  broadcasterId: string,
  first = 20,
): Promise<Array<TwitchVideo>> {
  return withAppToken(async (token) => {
    const { data } = await helixGet<TwitchVideo>('/videos', token, {
      user_id: broadcasterId,
      type: 'archive',
      first: String(first),
      sort: 'time',
    })
    return data
  })
}

/** Which of the given video ids Twitch still lists. Deleted ones are absent. */
export function getExistingVideoIds(ids: Array<string>): Promise<Set<string>> {
  return withAppToken(async (token) => {
    const found = new Set<string>()
    for (const batch of chunk(ids)) {
      const { data } = await helixGet<{ id: string }>('/videos', token, {
        id: batch,
      })
      for (const v of data) found.add(v.id)
    }
    return found
  })
}

export interface TwitchStream {
  id: string // matches vod.stream_id of the VOD currently being recorded
  user_id: string
}

export function getLiveStreams(
  broadcasterIds: Array<string>,
): Promise<Array<TwitchStream>> {
  return withAppToken(async (token) => {
    const live: Array<TwitchStream> = []
    for (const batch of chunk(broadcasterIds)) {
      const { data } = await helixGet<TwitchStream>('/streams', token, {
        user_id: batch,
        first: String(PAGE_SIZE),
      })
      live.push(...data)
    }
    return live
  })
}

// ── Chat badges (app token) ──────────────────────────────────────────────

interface TwitchBadgeSet {
  set_id: string
  versions: Array<{
    id: string
    image_url_1x: string
    image_url_2x: string
    title: string
  }>
}

/** setId -> version -> badge image. */
export type BadgeMap = Record<
  string,
  Record<string, { url: string; url2x: string; title: string }>
>

function toBadgeMap(sets: Array<TwitchBadgeSet>): BadgeMap {
  const map: BadgeMap = {}
  for (const set of sets) {
    map[set.set_id] = {}
    for (const v of set.versions) {
      map[set.set_id][v.id] = {
        url: v.image_url_1x,
        url2x: v.image_url_2x,
        title: v.title,
      }
    }
  }
  return map
}

// Global badges (moderator, VIP, broadcaster, …) are identical for every
// channel and change rarely, so they are cached for the process lifetime.
let globalBadges: { map: BadgeMap; expiresAt: number } | null = null

export async function getGlobalBadges(): Promise<BadgeMap> {
  if (globalBadges && globalBadges.expiresAt > Date.now()) return globalBadges.map
  const sets = await withAppToken(
    async (token) => (await helixGet<TwitchBadgeSet>('/chat/badges/global', token)).data,
  )
  globalBadges = {
    map: toBadgeMap(sets),
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  }
  return globalBadges.map
}

/** Badges specific to one channel: subscriber tiers, bits, campaigns. */
export function getChannelBadges(broadcasterId: string): Promise<BadgeMap> {
  return withAppToken(async (token) => {
    const { data } = await helixGet<TwitchBadgeSet>('/chat/badges', token, {
      broadcaster_id: broadcasterId,
    })
    return toBadgeMap(data)
  })
}
