import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '#/db'
import { streamer, subscription, vod, watchProgress } from '#/db/schema'
import { requireUserId } from '#/lib/current-user'
import { pollVods } from '#/lib/poll-vods'

const feedColumns = {
  id: vod.id,
  twitchVideoId: vod.twitchVideoId,
  title: vod.title,
  thumbnailUrl: vod.thumbnailUrl,
  publishedAt: vod.publishedAt,
  durationSeconds: vod.durationSeconds,
  watched: watchProgress.watched,
  streamerId: vod.streamerId,
  streamerName: streamer.displayName,
  profileImageUrl: streamer.profileImageUrl,
  category: subscription.category,
  position: watchProgress.positionSeconds,
  isAvailable: vod.isAvailable,
}

// Feed = VODs from streamers the current user subscribes to, with that user's
// own watched/resume state.
export const listVods = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await requireUserId()
  return (
    db
      .select(feedColumns)
      .from(vod)
      .innerJoin(streamer, eq(vod.streamerId, streamer.id))
      .innerJoin(
        subscription,
        and(
          eq(subscription.streamerId, streamer.id),
          eq(subscription.userId, userId),
        ),
      )
      .leftJoin(
        watchProgress,
        and(eq(watchProgress.vodId, vod.id), eq(watchProgress.userId, userId)),
      )
      // Deleted VODs stay in the feed with a "Deleted" tag (not filtered out).
      .orderBy(desc(vod.publishedAt))
  )
})

// The current user's started-but-unfinished VODs.
export const listContinueWatching = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    return db
      .select(feedColumns)
      .from(watchProgress)
      .innerJoin(vod, eq(watchProgress.vodId, vod.id))
      .innerJoin(streamer, eq(vod.streamerId, streamer.id))
      .innerJoin(
        subscription,
        and(
          eq(subscription.streamerId, streamer.id),
          eq(subscription.userId, userId),
        ),
      )
      .where(
        and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.completed, false),
          eq(watchProgress.watched, false),
          gt(watchProgress.positionSeconds, 0),
          eq(vod.isAvailable, true),
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
    await requireUserId()
    return pollVods()
  },
)

export type FeedVod = Awaited<ReturnType<typeof listVods>>[number]
