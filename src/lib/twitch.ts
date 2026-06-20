// Twitch Helix client. User-token calls (follows import) live here; the
// app-access-token path for public VOD reads is added in Phase 3.

const HELIX = 'https://api.twitch.tv/helix'

function clientId() {
  const id = process.env.TWITCH_CLIENT_ID
  if (!id) throw new Error('TWITCH_CLIENT_ID is not set')
  return id
}

function clientSecret() {
  const secret = process.env.TWITCH_CLIENT_SECRET
  if (!secret) throw new Error('TWITCH_CLIENT_SECRET is not set')
  return secret
}

// App access token (client-credentials) for public reads. Cached in memory;
// refreshed shortly before expiry. Used by the worker for /helix/videos.
let appToken: { token: string; expiresAt: number } | null = null

export async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000)
    return appToken.token
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    throw new Error(`Twitch app token ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as {
    access_token: string
    expires_in: number
  }
  appToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return appToken.token
}

export interface HelixPage<T> {
  data: Array<T>
  pagination?: { cursor?: string }
}

export interface TwitchUser {
  id: string
  login: string
  display_name: string
  profile_image_url: string
  broadcaster_type: '' | 'affiliate' | 'partner'
}

export interface TwitchFollowedChannel {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  followed_at: string
}

async function helixGet<T>(
  path: string,
  token: string,
  params: Record<string, string | Array<string>> = {},
): Promise<HelixPage<T>> {
  const url = new URL(HELIX + path)
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value))
      value.forEach((v) => url.searchParams.append(key, v))
    else url.searchParams.set(key, value)
  }
  const res = await fetch(url, {
    headers: { 'Client-Id': clientId(), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Twitch ${path} ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<HelixPage<T>>
}

/** The user that owns the supplied user token. */
export async function getCurrentUser(token: string): Promise<TwitchUser> {
  const { data } = await helixGet<TwitchUser>('/users', token)
  if (!data[0]) throw new Error('Twitch /users returned no user')
  return data[0]
}

/** Channels the user follows. Paginates fully (100 per page). */
export async function getFollowedChannels(
  token: string,
  userId: string,
): Promise<Array<TwitchFollowedChannel>> {
  const all: Array<TwitchFollowedChannel> = []
  let cursor: string | undefined
  do {
    const params: Record<string, string> = { user_id: userId, first: '100' }
    if (cursor) params.after = cursor
    const page = await helixGet<TwitchFollowedChannel>(
      '/channels/followed',
      token,
      params,
    )
    all.push(...page.data)
    cursor = page.pagination?.cursor
  } while (cursor)
  return all
}

/** Hydrate full user objects by id (batches of 100). */
export async function getUsersByIds(
  token: string,
  ids: Array<string>,
): Promise<Array<TwitchUser>> {
  const out: Array<TwitchUser> = []
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { data } = await helixGet<TwitchUser>('/users', token, { id: batch })
    out.push(...data)
  }
  return out
}

/** Look up a single user by login name. */
export async function getUserByLogin(
  token: string,
  login: string,
): Promise<TwitchUser | null> {
  const { data } = await helixGet<TwitchUser>('/users', token, { login })
  return data[0] ?? null
}

export interface TwitchVideo {
  id: string
  stream_id: string | null
  user_id: string
  title: string
  description: string
  created_at: string
  published_at: string
  url: string
  thumbnail_url: string
  type: string
  duration: string // e.g. "3h20m31s"
}

/** Latest archive VODs for a broadcaster (app token). */
export async function getArchiveVideos(
  token: string,
  userId: string,
  first = 20,
): Promise<Array<TwitchVideo>> {
  const { data } = await helixGet<TwitchVideo>('/videos', token, {
    user_id: userId,
    type: 'archive',
    first: String(first),
    sort: 'time',
  })
  return data
}

/** Of the given video ids, which still exist on Twitch (app token). Deleted
 * VODs are simply omitted from the response. */
export async function getExistingVideoIds(
  token: string,
  ids: Array<string>,
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { data } = await helixGet<{ id: string }>('/videos', token, {
      id: batch,
    })
    for (const v of data) found.add(v.id)
  }
  return found
}

interface TwitchStream {
  user_id: string
}

/** Of the given broadcaster ids, which are live right now (app token). */
export async function getLiveUserIds(
  token: string,
  userIds: Array<string>,
): Promise<Set<string>> {
  const live = new Set<string>()
  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100)
    const { data } = await helixGet<TwitchStream>('/streams', token, {
      user_id: batch,
      first: '100',
    })
    for (const s of data) live.add(s.user_id)
  }
  return live
}

/** Parse Twitch duration ("1h2m3s", "45m10s", "30s") into seconds. */
export function parseDuration(duration: string): number {
  const m = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
  if (!m) return 0
  const [, h, min, s] = m
  return Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0)
}
