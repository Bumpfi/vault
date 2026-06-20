import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { userSetting } from '#/db/schema'
import { requireUserId } from '#/lib/current-user'

export const getSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const row = (
      await db
        .select()
        .from(userSetting)
        .where(eq(userSetting.userId, userId))
        .limit(1)
    )[0]
    return {
      defaultCategory: row?.defaultCategory ?? null,
      unwatchedDefault: row?.unwatchedDefault ?? false,
    }
  },
)

export const saveSettings = createServerFn({ method: 'POST' })
  .validator(
    (input: { defaultCategory: string | null; unwatchedDefault: boolean }) =>
      input,
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const defaultCategory = data.defaultCategory?.trim() || null
    await db
      .insert(userSetting)
      .values({
        userId,
        defaultCategory,
        unwatchedDefault: data.unwatchedDefault,
      })
      .onConflictDoUpdate({
        target: userSetting.userId,
        set: { defaultCategory, unwatchedDefault: data.unwatchedDefault },
      })
    return { ok: true }
  })
