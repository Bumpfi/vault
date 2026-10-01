import { eq, inArray } from 'drizzle-orm'
import { db } from '#/server/db'
import { vod } from '#/server/db/schema'
import { getExistingVideoIds } from '#/server/twitch/helix'

/** Marks VODs that Twitch no longer lists (deleted or expired) as unavailable. */
export async function checkAvailability() {
  const rows = await db
    .select({ id: vod.id, twitchVideoId: vod.twitchVideoId })
    .from(vod)
    .where(eq(vod.isAvailable, true))
  if (rows.length === 0) return { checked: 0, removed: 0 }

  const existing = await getExistingVideoIds(rows.map((r) => r.twitchVideoId))
  const goneIds = rows.filter((r) => !existing.has(r.twitchVideoId)).map((r) => r.id)
  if (goneIds.length > 0) {
    await db.update(vod).set({ isAvailable: false }).where(inArray(vod.id, goneIds))
  }

  console.log(
    `[check-availability] checked ${rows.length}, marked ${goneIds.length} unavailable`,
  )
  return { checked: rows.length, removed: goneIds.length }
}
