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
      theme: row?.theme ?? 'dark',
    }
  },
)

export const saveSettings = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      defaultCategory?: string | null
      unwatchedDefault?: boolean
      theme?: string
    }) => input,
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const set: Record<string, unknown> = {}
    if ('defaultCategory' in data)
      set.defaultCategory = data.defaultCategory?.trim() || null
    if ('unwatchedDefault' in data) set.unwatchedDefault = data.unwatchedDefault
    if ('theme' in data) set.theme = data.theme
    await db
      .insert(userSetting)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: userSetting.userId, set })
    return { ok: true }
  })
