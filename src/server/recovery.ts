import { createServerFn } from '@tanstack/react-start'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { streamer, vod } from '#/db/schema'
import { requireUserId } from '#/lib/current-user'

// Best-effort recovery of a deleted VOD: Twitch keeps the raw HLS segments on
// its CDN for a while after a VOD is removed from listings. The playlist URL is
// derivable from {login}_{streamId}_{startUnix}; we probe known CDN domains and
// a small timestamp window. Only works while the segments remain on the CDN.
const DOMAINS = [
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

function vodPath(login: string, streamId: string, t: number) {
  const hash = createHash('sha1')
    .update(`${login}_${streamId}_${t}`)
    .digest('hex')
    .slice(0, 20)
  return `${hash}_${login}_${streamId}_${t}`
}

async function probe(login: string, streamId: string, baseTs: number) {
  // ±20s window (Helix created_at can differ slightly from the stream start).
  for (let off = 0; off <= 20; off++) {
    for (const sign of off === 0 ? [0] : [1, -1]) {
      const t = baseTs + sign * off
      const path = vodPath(login, streamId, t)
      const url = await Promise.any(
        DOMAINS.map(async (d) => {
          const u = `https://${d}/${path}/chunked/index-dvr.m3u8`
          const r = await fetch(u)
          if (r.status === 200) return u
          throw new Error('miss')
        }),
      ).catch(() => null)
      if (url) return url
    }
  }
  return null
}

export const recoverVod = createServerFn({ method: 'POST' })
  .validator((vodId: number) => vodId)
  .handler(async ({ data: vodId }) => {
    await requireUserId()
    const row = (
      await db
        .select({
          streamId: vod.streamId,
          createdAt: vod.createdAtTwitch,
          login: streamer.login,
        })
        .from(vod)
        .innerJoin(streamer, eq(streamer.id, vod.streamerId))
        .where(eq(vod.id, vodId))
        .limit(1)
    )[0]
    if (!row?.streamId || !row.createdAt) return { url: null as string | null }
    const baseTs = Math.floor(new Date(row.createdAt).getTime() / 1000)
    const url = await probe(row.login, row.streamId, baseTs)
    return { url }
  })
