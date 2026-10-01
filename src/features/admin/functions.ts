import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { adminMiddleware } from '#/features/auth/middleware'
import { db } from '#/server/db'
import { appSetting, user } from '#/server/db/schema'

export const getAdminOverview = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const [settings] = await db.select().from(appSetting).limit(1)
    const users = await db
      .select({ id: user.id, name: user.name, image: user.image, role: user.role })
      .from(user)
      .orderBy(user.createdAt)
    return { registrationEnabled: settings?.registrationEnabled ?? true, users }
  })

export const setRegistrationEnabled = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.boolean())
  .handler(async ({ data: enabled }) => {
    await db
      .insert(appSetting)
      .values({ id: 1, registrationEnabled: enabled })
      .onConflictDoUpdate({
        target: appSetting.id,
        set: { registrationEnabled: enabled },
      })
  })

/**
 * Deletes a user. Their library, progress and settings cascade with them;
 * the shared streamer/VOD catalog is untouched.
 */
export const removeUser = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.string().min(1))
  .handler(async ({ data: userId, context }) => {
    if (userId === context.user.id) throw new Error('You cannot remove yourself.')
    await db.delete(user).where(eq(user.id, userId))
  })
