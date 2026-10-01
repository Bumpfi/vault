import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { and, count, eq } from 'drizzle-orm'
import { db } from '#/server/db'
import * as schema from '#/server/db/schema'
import { env } from '#/server/env'

async function userCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schema.user)
  return row.n
}

async function isExistingAccount(twitchUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.providerId, 'twitch'),
        eq(schema.account.accountId, twitchUserId),
      ),
    )
    .limit(1)
  return rows.length > 0
}

async function registrationEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ enabled: schema.appSetting.registrationEnabled })
    .from(schema.appSetting)
    .limit(1)
  return row?.enabled ?? true
}

function forbidden(message: string): never {
  throw new APIError('FORBIDDEN', { message })
}

/**
 * Decides whether a Twitch login may create a new account. Runs before any
 * user row is written, so a rejected login leaves nothing behind.
 */
async function assertSignupAllowed(twitchUserId: string) {
  if (await isExistingAccount(twitchUserId)) return // sign-in, not sign-up
  if ((await userCount()) === 0) return // first user always gets in
  if (!(await registrationEnabled())) {
    forbidden('Registration is disabled on this Vault.')
  }
  const allowlist = env.ALLOWED_TWITCH_USER_IDS
  if (allowlist.length > 0 && !allowlist.includes(twitchUserId)) {
    forbidden('This Twitch account is not allowed to use this Vault.')
  }
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  socialProviders: {
    twitch: {
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      // Defaults are openid + user:read:email; follows import needs this.
      scope: ['user:read:follows'],
      // `profile.sub` is the numeric Twitch user id.
      mapProfileToUser: async (profile) => {
        await assertSignupAllowed(profile.sub)
        return {}
      },
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => ({
          data: { ...newUser, role: (await userCount()) === 0 ? 'admin' : 'user' },
        }),
      },
    },
  },
  plugins: [tanstackStartCookies()],
})
