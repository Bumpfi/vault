import { eq, inArray } from 'drizzle-orm'
import { db } from '#/db'
import { vod } from '#/db/schema'
import { getAppToken, getExistingVideoIds } from '#/lib/twitch'

// Check whether currently-available VODs still exist on Twitch; mark the gone
// ones unavailable (deleted/expired). Shared by the worker + manual refresh.
export async function checkAvailability() {
  const rows = await db
    .select({ id: vod.id, twitchVideoId: vod.twitchVideoId })
    .from(vod)
    .where(eq(vod.isAvailable, true))
  if (rows.length === 0) return { checked: 0, removed: 0 }

  const token = await getAppToken()
  const existing = await getExistingVideoIds(
    token,
    rows.map((r) => r.twitchVideoId),
  )
  const goneIds = rows
    .filter((r) => !existing.has(r.twitchVideoId))
    .map((r) => r.id)
  if (goneIds.length > 0) {
    await db
      .update(vod)
      .set({ isAvailable: false })
      .where(inArray(vod.id, goneIds))
  }
  console.log(
    `[availability-check] checked ${rows.length}, marked ${goneIds.length} unavailable`,
  )
  return { checked: rows.length, removed: goneIds.length }
}
