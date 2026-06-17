import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { streamer, subscription, vod } from '#/db/schema'
import { getAppToken, getArchiveVideos, parseDuration } from '#/lib/twitch'

// Poll every streamer that at least one user subscribes to, and upsert their
// latest archive VODs. Shared by the BullMQ worker (scheduled) and the
// manual-refresh server fn.
export async function pollVods() {
  const subs = await db
    .selectDistinct({
      id: streamer.id,
      twitchUserId: streamer.twitchUserId,
      login: streamer.login,
    })
    .from(streamer)
    .innerJoin(subscription, eq(subscription.streamerId, streamer.id))

  if (subs.length === 0) {
    console.log('[poll-vods] no subscribed streamers, skipping')
    return { polled: 0, upserted: 0 }
  }

  const token = await getAppToken()
  let upserted = 0

  for (const s of subs) {
    try {
      const videos = await getArchiveVideos(token, s.twitchUserId)
      if (videos.length === 0) continue

      await db
        .insert(vod)
        .values(
          videos.map((v) => ({
            twitchVideoId: v.id,
            streamerId: s.id,
            title: v.title,
            description: v.description,
            url: v.url,
            thumbnailUrl: v.thumbnail_url,
            streamId: v.stream_id,
            createdAtTwitch: v.created_at ? new Date(v.created_at) : null,
            publishedAt: v.published_at ? new Date(v.published_at) : null,
            durationSeconds: parseDuration(v.duration),
            type: v.type,
          })),
        )
        // Refresh mutable metadata; never touch watched / isAvailable.
        .onConflictDoUpdate({
          target: vod.twitchVideoId,
          set: {
            title: vod.title,
            thumbnailUrl: vod.thumbnailUrl,
            durationSeconds: vod.durationSeconds,
            publishedAt: vod.publishedAt,
          },
        })
      upserted += videos.length
    } catch (err) {
      console.error(`[poll-vods] ${s.login} failed:`, err)
    }
  }

  console.log(
    `[poll-vods] polled ${subs.length} streamers, upserted ${upserted}`,
  )
  return { polled: subs.length, upserted }
}
