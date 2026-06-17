import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { vod, watchProgress } from '#/db/schema'
import { requireUserId } from '#/lib/current-user'

const WATCHED_THRESHOLD = 0.9

/** VOD + the current user's saved resume position for the player page. */
export const getWatchData = createServerFn({ method: 'GET' })
  .validator((videoId: string) => videoId)
  .handler(async ({ data: videoId }) => {
    const userId = await requireUserId()
    const rows = await db
      .select({
        id: vod.id,
        twitchVideoId: vod.twitchVideoId,
        title: vod.title,
        durationSeconds: vod.durationSeconds,
        watched: watchProgress.watched,
        position: watchProgress.positionSeconds,
      })
      .from(vod)
      .leftJoin(
        watchProgress,
        and(eq(watchProgress.vodId, vod.id), eq(watchProgress.userId, userId)),
      )
      .where(eq(vod.twitchVideoId, videoId))
      .limit(1)
    return rows[0] ?? null
  })

export const saveProgress = createServerFn({ method: 'POST' })
  .validator(
    (input: { vodId: number; position: number; duration: number }) => input,
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const completed =
      data.duration > 0 && data.position / data.duration >= WATCHED_THRESHOLD

    await db
      .insert(watchProgress)
      .values({
        userId,
        vodId: data.vodId,
        positionSeconds: Math.floor(data.position),
        durationSeconds: Math.floor(data.duration),
        completed,
        watched: completed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.vodId],
        set: {
          positionSeconds: Math.floor(data.position),
          durationSeconds: Math.floor(data.duration),
          completed,
          // Only flip watched on when crossing the threshold; never auto-off.
          ...(completed ? { watched: true } : {}),
          updatedAt: new Date(),
        },
      })
    return { completed }
  })

export const setWatched = createServerFn({ method: 'POST' })
  .validator((input: { vodId: number; watched: boolean }) => input)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    await db
      .insert(watchProgress)
      .values({ userId, vodId: data.vodId, watched: data.watched })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.vodId],
        set: { watched: data.watched, updatedAt: new Date() },
      })
    return { ok: true }
  })
