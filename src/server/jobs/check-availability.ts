import { inArray } from 'drizzle-orm'
import { db } from '#/server/db'
import { vod } from '#/server/db/schema'
import { getExistingVideoIds } from '#/server/twitch/helix'

/**
 * Syncs `isAvailable` with what Twitch lists. Runs both ways: Helix's id
 * lookup occasionally misses a VOD that still exists, so a wrongly flagged
 * VOD has to be able to come back on the next run.
 */
// ponytail: re-checks every VOD ever seen; filter by age if the catalog gets huge.
export async function checkAvailability() {
  const rows = await db
    .select({
      id: vod.id,
      twitchVideoId: vod.twitchVideoId,
      isAvailable: vod.isAvailable,
    })
    .from(vod)
  if (rows.length === 0) return { checked: 0, removed: 0, restored: 0 }

  const existing = await getExistingVideoIds(rows.map((r) => r.twitchVideoId))
  const gone = rows.filter((r) => r.isAvailable && !existing.has(r.twitchVideoId))
  const back = rows.filter((r) => !r.isAvailable && existing.has(r.twitchVideoId))
  // Twitch answering "none of these exist" is an API hiccup, not a mass deletion.
  if (existing.size === 0) return { checked: rows.length, removed: 0, restored: 0 }

  if (gone.length > 0) {
    await db
      .update(vod)
      .set({ isAvailable: false })
      .where(
        inArray(
          vod.id,
          gone.map((r) => r.id),
        ),
      )
  }
  if (back.length > 0) {
    await db
      .update(vod)
      .set({ isAvailable: true })
      .where(
        inArray(
          vod.id,
          back.map((r) => r.id),
        ),
      )
  }

  console.log(
    `[check-availability] checked ${rows.length}, marked ${gone.length} unavailable, restored ${back.length}`,
  )
  return { checked: rows.length, removed: gone.length, restored: back.length }
}
