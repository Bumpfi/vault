import { and, eq, sql } from 'drizzle-orm'
import { db } from '#/server/db'
import { streamer, subscription, vod } from '#/server/db/schema'
import { playlistFromUsher } from '#/server/twitch/cdn'
import { getArchiveVideos } from '#/server/twitch/helix'
import { parseDuration } from '#/lib/format'

/**
 * Fetches the latest archived VODs for every streamer that is enabled in at
 * least one user's library and upserts them into the shared catalog.
 * Pass `userId` to limit the poll to one user's streamers (manual refresh).
 */
export async function pollVods(options: { userId?: string } = {}) {
  const streamers = await db
    .selectDistinct({
      id: streamer.id,
      twitchUserId: streamer.twitchUserId,
      login: streamer.login,
    })
    .from(streamer)
    .innerJoin(
      subscription,
      and(
        eq(subscription.streamerId, streamer.id),
        eq(subscription.enabled, true),
        options.userId ? eq(subscription.userId, options.userId) : undefined,
      ),
    )

  let upserted = 0
  // Sequential on purpose: polling is periodic background work and staying
  // well inside Twitch's rate limit matters more than speed.
  for (const s of streamers) {
    try {
      const videos = await getArchiveVideos(s.twitchUserId)
      if (videos.length === 0) continue
      const rows = await db
        .insert(vod)
        .values(
          videos.map((v) => ({
            twitchVideoId: v.id,
            streamerId: s.id,
            title: v.title,
            thumbnailUrl: v.thumbnail_url,
            streamId: v.stream_id,
            createdAtTwitch: new Date(v.created_at),
            publishedAt: new Date(v.published_at),
            durationSeconds: parseDuration(v.duration),
          })),
        )
        // Refresh the fields that change while a VOD is recording or being
        // processed. `excluded` is the row that failed to insert; referencing
        // the table's own columns here would be a no-op.
        .onConflictDoUpdate({
          target: vod.twitchVideoId,
          set: {
            title: sql`excluded.title`,
            thumbnailUrl: sql`excluded.thumbnail_url`,
            durationSeconds: sql`excluded.duration_seconds`,
            publishedAt: sql`excluded.published_at`,
            // Listed in the channel's archive, so it exists. Heals a VOD the
            // availability check wrongly flagged.
            isAvailable: true,
          },
        })
        .returning({
          id: vod.id,
          twitchVideoId: vod.twitchVideoId,
          playlistUrl: vod.playlistUrl,
        })
      upserted += videos.length

      // Save each VOD's playlist once, while Twitch still hands it out, so
      // it can be recovered after deletion (see findPlaylistUrl).
      for (const row of rows.filter((r) => !r.playlistUrl)) {
        const url = await playlistFromUsher(row.twitchVideoId).catch(() => null)
        if (url) await db.update(vod).set({ playlistUrl: url }).where(eq(vod.id, row.id))
      }
    } catch (err) {
      // One failing channel shouldn't stop the rest.
      console.error(`[poll-vods] ${s.login} failed:`, err)
    }
  }

  console.log(`[poll-vods] polled ${streamers.length} streamers, upserted ${upserted}`)
  return { polled: streamers.length, upserted }
}
