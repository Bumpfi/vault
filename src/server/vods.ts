import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '#/db'
import { streamer, vod, watchProgress } from '#/db/schema'
import { auth } from '#/lib/auth'
import { pollVods } from '#/lib/poll-vods'

const feedColumns = {
  id: vod.id,
  twitchVideoId: vod.twitchVideoId,
  title: vod.title,
  url: vod.url,
  thumbnailUrl: vod.thumbnailUrl,
  publishedAt: vod.publishedAt,
  durationSeconds: vod.durationSeconds,
  watched: vod.watched,
  streamerId: vod.streamerId,
  streamerName: streamer.displayName,
  streamerLogin: streamer.login,
  profileImageUrl: streamer.profileImageUrl,
  position: watchProgress.positionSeconds,
}

export const listVods = createServerFn({ method: 'GET' }).handler(async () => {
  return db
    .select(feedColumns)
    .from(vod)
    .innerJoin(streamer, eq(vod.streamerId, streamer.id))
    .leftJoin(watchProgress, eq(watchProgress.vodId, vod.id))
    .where(and(eq(vod.isAvailable, true), eq(streamer.subscribed, true)))
    .orderBy(desc(vod.publishedAt))
})

// VODs started but not finished (0 < position, not completed).
export const listContinueWatching = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db
      .select(feedColumns)
      .from(watchProgress)
      .innerJoin(vod, eq(watchProgress.vodId, vod.id))
      .innerJoin(streamer, eq(vod.streamerId, streamer.id))
      .where(
        and(
          eq(watchProgress.completed, false),
          eq(vod.watched, false),
          gt(watchProgress.positionSeconds, 0),
          eq(vod.isAvailable, true),
          eq(streamer.subscribed, true),
        ),
      )
      .orderBy(desc(watchProgress.updatedAt))
      .limit(12)
  },
)

// Manual VOD refresh: runs the same poll the worker schedules, inline, so it
// works whether or not the worker process is running.
export const refreshVods = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')
    return pollVods()
  },
)

export type FeedVod = Awaited<ReturnType<typeof listVods>>[number]
