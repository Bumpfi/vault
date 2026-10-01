import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { authMiddleware } from '#/features/auth/middleware'
import { db } from '#/server/db'
import { userSetting } from '#/server/db/schema'
import { DEFAULT_THEME, THEME_IDS, isTheme } from '#/lib/theme'

export const getSettings = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [row] = await db
      .select()
      .from(userSetting)
      .where(eq(userSetting.userId, context.user.id))
      .limit(1)
    return {
      defaultCategory: row?.defaultCategory ?? null,
      unwatchedDefault: row?.unwatchedDefault ?? false,
      theme: isTheme(row?.theme) ? row.theme : DEFAULT_THEME,
    }
  })

/** Partial update: only the fields that are present are written. */
export const saveSettings = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        defaultCategory: z.string().trim().max(40).nullable(),
        unwatchedDefault: z.boolean(),
        theme: z.enum(THEME_IDS),
      })
      .partial(),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      ...data,
      ...('defaultCategory' in data
        ? { defaultCategory: data.defaultCategory || null }
        : {}),
    }
    if (Object.keys(patch).length === 0) return
    await db
      .insert(userSetting)
      .values({ userId: context.user.id, ...patch })
      .onConflictDoUpdate({ target: userSetting.userId, set: patch })
  })
