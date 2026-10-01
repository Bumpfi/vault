// Finds the HLS playlist (.m3u8) of a VOD, used for downloads and for
// playing back deleted VODs.
//
// 1. VODs Twitch still lists: request a playback token and ask Twitch's
//    playlist service ("usher") for the playlist — the same thing twitch.tv's
//    own player does.
// 2. Deleted VODs: usher no longer knows them, but the video files often stay
//    on the CDN for a while. Their path is derived from the channel login,
//    stream id and start time, so it can be rebuilt and probed.
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '#/server/db'
import { streamer, vod } from '#/server/db/schema'
import { fetchPlaybackToken } from '#/server/twitch/gql'

// CloudFront distributions Twitch serves VODs from. Twitch adds new ones over
// time; only deleted-VOD recovery depends on this list.
const CDN_HOSTS = [
  'd3fi1amfgojobc.cloudfront.net',
  'd2nvs31859zcd8.cloudfront.net',
  'dqrpb9wgowsf5.cloudfront.net',
  'ds0h3roq6wcgc.cloudfront.net',
  'd2e2de1etea730.cloudfront.net',
  'd2vjef5jvl6bfs.cloudfront.net',
  'd1m7jfoe9zdc1j.cloudfront.net',
  'd1mhjrowxxagfy.cloudfront.net',
  'ddacn6pr5v0tl.cloudfront.net',
  'd3c27h4odz752x.cloudfront.net',
  'dgeft87wbj63p.cloudfront.net',
  'd1ymi26ma8va5x.cloudfront.net',
  'd3aqoihi2n8ty8.cloudfront.net',
  'd3vd9lfkzbru3h.cloudfront.net',
  'vod-secure.twitch.tv',
  'vod-metro.twitch.tv',
  'vod-pop-secure.twitch.tv',
]

// The start time in the path can differ from the API's `created_at` by a few
// seconds, so a small window around it is searched.
const START_TIME_WINDOW_S = 20

/** Playlist of the highest-quality variant, via Twitch's playlist service. */
async function playlistFromUsher(twitchVideoId: string): Promise<string | null> {
  const token = await fetchPlaybackToken(twitchVideoId)
  if (!token) return null
  const url = new URL(`https://usher.ttvnw.net/vod/${twitchVideoId}.m3u8`)
  url.search = new URLSearchParams({
    allow_source: 'true',
    nauth: token.value,
    nauthsig: token.signature,
  }).toString()
  const res = await fetch(url)
  if (!res.ok) return null
  // A master playlist lists one playlist per quality, best first.
  const master = await res.text()
  return master.split('\n').find((line) => line.startsWith('https://')) ?? null
}

function cdnPath(login: string, streamId: string, startUnix: number) {
  const key = `${login}_${streamId}_${startUnix}`
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 20)
  return `${hash}_${key}`
}

/** Rebuilds the playlist path and checks which CDN host still serves it. */
async function playlistFromCdn(login: string, streamId: string, startUnix: number) {
  // Closest timestamps first: 0, +1, -1, +2, -2, …
  for (let off = 0; off <= START_TIME_WINDOW_S; off++) {
    for (const t of off === 0 ? [startUnix] : [startUnix + off, startUnix - off]) {
      const path = cdnPath(login, streamId, t)
      const url = await Promise.any(
        CDN_HOSTS.map(async (host) => {
          const candidate = `https://${host}/${path}/chunked/index-dvr.m3u8`
          const res = await fetch(candidate, { method: 'HEAD' })
          if (!res.ok) throw new Error('miss')
          return candidate
        }),
      ).catch(() => null)
      if (url) return url
    }
  }
  return null
}

/** The VOD's playlist URL, or null if Twitch no longer has its files. */
export async function findPlaylistUrl(vodId: number): Promise<string | null> {
  const [row] = await db
    .select({
      twitchVideoId: vod.twitchVideoId,
      isAvailable: vod.isAvailable,
      streamId: vod.streamId,
      startedAt: vod.createdAtTwitch,
      login: streamer.login,
    })
    .from(vod)
    .innerJoin(streamer, eq(streamer.id, vod.streamerId))
    .where(eq(vod.id, vodId))
    .limit(1)
  if (!row) return null

  if (row.isAvailable) {
    const url = await playlistFromUsher(row.twitchVideoId).catch(() => null)
    if (url) return url
  }
  if (!row.streamId || !row.startedAt) return null
  return playlistFromCdn(
    row.login,
    row.streamId,
    Math.floor(row.startedAt.getTime() / 1000),
  )
}
