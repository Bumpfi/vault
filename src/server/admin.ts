import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { appSetting, user } from '#/db/schema'
import { auth } from '#/lib/auth'

async function requireAdmin() {
  const { headers } = getRequest()
  const session = await auth.api.getSession({ headers })
  if (!session) throw new Error('Unauthorized')
  const rows = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)
  if (rows[0]?.role !== 'admin') throw new Error('Admin only')
  return session.user.id
}

// Admin panel data. Throws for non-admins — the settings page uses that to
// hide the section entirely.
export const getAdminInfo = createServerFn({ method: 'GET' }).handler(
  async () => {
    const adminId = await requireAdmin()
    const setting = await db.select().from(appSetting).limit(1)
    const users = await db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(user.createdAt)
    return {
      adminId,
      registrationEnabled: setting[0]?.registrationEnabled ?? true,
      users,
    }
  },
)

export const setRegistrationEnabled = createServerFn({ method: 'POST' })
  .validator((enabled: boolean) => enabled)
  .handler(async ({ data: enabled }) => {
    await requireAdmin()
    await db
      .insert(appSetting)
      .values({ id: 1, registrationEnabled: enabled })
      .onConflictDoUpdate({
        target: appSetting.id,
        set: { registrationEnabled: enabled },
      })
    return { ok: true }
  })

// Remove a user and all their data (subscriptions/progress/settings cascade
// via FK). Their streamers/VODs stay in the shared catalog.
export const removeUser = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const adminId = await requireAdmin()
    if (userId === adminId) throw new Error('You cannot remove yourself.')
    await db.delete(user).where(eq(user.id, userId))
    return { ok: true }
  })
