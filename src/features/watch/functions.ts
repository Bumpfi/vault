import { createServerFn } from '@tanstack/react-start'
import { and, eq, lte } from 'drizzle-orm'
import { z } from 'zod'
import { authMiddleware } from '#/features/auth/middleware'
import { db } from '#/server/db'
import { streamer, vod, watchProgress } from '#/server/db/schema'
import { findPlaylistUrl } from '#/server/twitch/cdn'
import { fetchCategories } from '#/server/twitch/gql'

/** Share of a VOD that counts as finished. */
const COMPLETED_AT = 0.9

const vodId = z.number().int().positive()

/** A VOD plus the user's resume position, for the player page. */
export const getWatchData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.string().regex(/^\d+$/))
  .handler(async ({ data: twitchVideoId, context }) => {
    const [row] = await db
      .select({
        id: vod.id,
        twitchVideoId: vod.twitchVideoId,
        title: vod.title,
        durationSeconds: vod.durationSeconds,
        createdAtTwitch: vod.createdAtTwitch,
        isAvailable: vod.isAvailable,
        broadcasterId: streamer.twitchUserId, // for channel chat badges
        watched: watchProgress.watched,
        position: watchProgress.positionSeconds,
      })
      .from(vod)
      .innerJoin(streamer, eq(streamer.id, vod.streamerId))
      .leftJoin(
        watchProgress,
        and(eq(watchProgress.vodId, vod.id), eq(watchProgress.userId, context.user.id)),
      )
      .where(eq(vod.twitchVideoId, twitchVideoId))
      .limit(1)
    return row ?? null
  })

/** Saves the resume position; marks the VOD watched once past 90%. */
export const saveProgress = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      vodId,
      position: z.number().nonnegative(),
      duration: z.number().nonnegative(),
    }),
  )
  .handler(async ({ data, context }) => {
    const completed = data.duration > 0 && data.position / data.duration >= COMPLETED_AT
    const positionSeconds = Math.floor(data.position)
    await db
      .insert(watchProgress)
      .values({
        userId: context.user.id,
        vodId: data.vodId,
        positionSeconds,
        completed,
        watched: completed,
      })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.vodId],
        set: {
          positionSeconds,
          completed,
          // Only ever switch `watched` on automatically, never off.
          ...(completed ? { watched: true } : {}),
          updatedAt: new Date(),
        },
      })
    return { completed }
  })

export const setWatched = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ vodId, watched: z.boolean() }))
  .handler(async ({ data, context }) => {
    await db
      .insert(watchProgress)
      .values({ userId: context.user.id, vodId: data.vodId, watched: data.watched })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.vodId],
        set: { watched: data.watched, updatedAt: new Date() },
      })
  })

/** Marks a VOD and every older VOD of the same streamer as watched. */
export const markOlderWatched = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(vodId)
  .handler(async ({ data: id, context }) => {
    const [anchor] = await db
      .select({ streamerId: vod.streamerId, publishedAt: vod.publishedAt })
      .from(vod)
      .where(eq(vod.id, id))
      .limit(1)
    if (!anchor?.publishedAt) return { marked: 0 }

    const older = await db
      .select({ id: vod.id })
      .from(vod)
      .where(
        and(
          eq(vod.streamerId, anchor.streamerId),
          lte(vod.publishedAt, anchor.publishedAt),
        ),
      )
    await db
      .insert(watchProgress)
      .values(older.map((v) => ({ userId: context.user.id, vodId: v.id, watched: true })))
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.vodId],
        set: { watched: true, updatedAt: new Date() },
      })
    return { marked: older.length }
  })

/**
 * Tries to find a deleted VOD's files on Twitch's CDN. Only works for a
 * while after deletion, before Twitch purges the segments.
 */
export const recoverVod = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(vodId)
  .handler(async ({ data: id }) => ({ url: await findPlaylistUrl(id) }))

/** The categories (games) a VOD was streamed in, with their start times. */
export const getCategories = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.string().regex(/^\d+$/))
  .handler(async ({ data: twitchVideoId }) => {
    try {
      return await fetchCategories(twitchVideoId)
    } catch {
      return [] // optional extra; never break the page over it
    }
  })
