import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gt } from 'drizzle-orm'
import { authMiddleware } from '#/features/auth/middleware'
import { db } from '#/server/db'
import { streamer, subscription, vod, watchProgress } from '#/server/db/schema'
import { pollVods } from '#/server/jobs/poll-vods'
import { getLiveStreams } from '#/server/twitch/helix'

const feedColumns = {
  id: vod.id,
  twitchVideoId: vod.twitchVideoId,
  title: vod.title,
  thumbnailUrl: vod.thumbnailUrl,
  publishedAt: vod.publishedAt,
  durationSeconds: vod.durationSeconds,
  isAvailable: vod.isAvailable,
  streamId: vod.streamId,
  streamerId: vod.streamerId,
  streamerName: streamer.displayName,
  profileImageUrl: streamer.profileImageUrl,
  category: subscription.category,
  watched: watchProgress.watched,
  position: watchProgress.positionSeconds,
}

/** Joins a VOD query to the user's enabled subscriptions and their progress. */
function feedQuery(userId: string) {
  return db
    .select(feedColumns)
    .from(vod)
    .innerJoin(streamer, eq(vod.streamerId, streamer.id))
    .innerJoin(
      subscription,
      and(
        eq(subscription.streamerId, streamer.id),
        eq(subscription.userId, userId),
        eq(subscription.enabled, true),
      ),
    )
    .leftJoin(
      watchProgress,
      and(eq(watchProgress.vodId, vod.id), eq(watchProgress.userId, userId)),
    )
    .$dynamic()
}

export type FeedVod = Awaited<ReturnType<typeof listVods>>[number]

/** Every VOD from the user's streamers, newest first. Deleted ones included. */
export const listVods = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => feedQuery(context.user.id).orderBy(desc(vod.publishedAt)))

/** Started but unfinished VODs, most recently watched first. */
export const listContinueWatching = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) =>
    feedQuery(context.user.id)
      .where(
        and(
          eq(watchProgress.completed, false),
          eq(watchProgress.watched, false),
          gt(watchProgress.positionSeconds, 0),
          eq(vod.isAvailable, true),
        ),
      )
      .orderBy(desc(watchProgress.updatedAt))
      .limit(12),
  )

/**
 * Manual refresh: polls the caller's streamers right away instead of waiting
 * for the scheduled job, so it also works when the worker isn't running.
 */
export const refreshVods = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(({ context }) => pollVods({ userId: context.user.id }))

/**
 * Which of the user's streamers are live. `streamIds` identifies the VOD
 * that is currently being recorded, so only that one gets a LIVE badge.
 */
export const listLiveStatus = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const subs = await db
      .select({ id: streamer.id, twitchUserId: streamer.twitchUserId })
      .from(streamer)
      .innerJoin(
        subscription,
        and(
          eq(subscription.streamerId, streamer.id),
          eq(subscription.userId, context.user.id),
          eq(subscription.enabled, true),
        ),
      )
    if (subs.length === 0) return { streamerIds: [], streamIds: [] }

    const live = await getLiveStreams(subs.map((s) => s.twitchUserId))
    const liveChannels = new Set(live.map((s) => s.user_id))
    return {
      streamerIds: subs.filter((s) => liveChannels.has(s.twitchUserId)).map((s) => s.id),
      streamIds: live.map((s) => s.id),
    }
  })
