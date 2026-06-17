import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { vod, watchProgress } from '#/db/schema'

const WATCHED_THRESHOLD = 0.9

/** VOD + saved resume position for the player page. */
export const getWatchData = createServerFn({ method: 'GET' })
  .validator((videoId: string) => videoId)
  .handler(async ({ data: videoId }) => {
    const rows = await db
      .select({
        id: vod.id,
        twitchVideoId: vod.twitchVideoId,
        title: vod.title,
        durationSeconds: vod.durationSeconds,
        watched: vod.watched,
        position: watchProgress.positionSeconds,
      })
      .from(vod)
      .leftJoin(watchProgress, eq(watchProgress.vodId, vod.id))
      .where(eq(vod.twitchVideoId, videoId))
      .limit(1)
    return rows[0] ?? null
  })

export const saveProgress = createServerFn({ method: 'POST' })
  .validator(
    (input: { vodId: number; position: number; duration: number }) => input,
  )
  .handler(async ({ data }) => {
    const completed =
      data.duration > 0 && data.position / data.duration >= WATCHED_THRESHOLD

    await db
      .insert(watchProgress)
      .values({
        vodId: data.vodId,
        positionSeconds: Math.floor(data.position),
        durationSeconds: Math.floor(data.duration),
        completed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: watchProgress.vodId,
        set: {
          positionSeconds: Math.floor(data.position),
          durationSeconds: Math.floor(data.duration),
          completed,
          updatedAt: new Date(),
        },
      })

    if (completed) {
      await db.update(vod).set({ watched: true }).where(eq(vod.id, data.vodId))
    }
    return { completed }
  })

export const setWatched = createServerFn({ method: 'POST' })
  .validator((input: { vodId: number; watched: boolean }) => input)
  .handler(async ({ data }) => {
    await db
      .update(vod)
      .set({ watched: data.watched })
      .where(eq(vod.id, data.vodId))
    return { ok: true }
  })
