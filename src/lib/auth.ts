import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { APIError } from 'better-auth/api'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import * as schema from '#/db/schema'

// Optional comma-separated Twitch user id allowlist (legacy env gate). Empty =
// no allowlist; signup is then governed by the in-app registration toggle.
const ALLOWED_TWITCH_USER_IDS = (process.env.ALLOWED_TWITCH_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function userCount(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.user)
  return rows[0].count
}

async function registrationEnabled(): Promise<boolean> {
  const rows = await db
    .select({ enabled: schema.appSetting.registrationEnabled })
    .from(schema.appSetting)
    .limit(1)
  return rows[0]?.enabled ?? true // no row yet = default open
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // No email/password — only Twitch OAuth.
  socialProviders: {
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
      // Default scopes are user:read:email + openid. Add follows import.
      scope: ['user:read:follows'],
      // Signup gate. profile.sub is the Twitch numeric user id, available
      // before any user/account row is written (no orphan rows on reject).
      // Existing users always get through — this only gates NEW signups:
      //   1. the very first user is always allowed (becomes admin),
      //   2. the admin's in-app registration toggle must be on,
      //   3. the optional env allowlist (if set) must contain the id.
      mapProfileToUser: async (profile) => {
        const existing = await db
          .select({ id: schema.account.id })
          .from(schema.account)
          .where(
            and(
              eq(schema.account.providerId, 'twitch'),
              eq(schema.account.accountId, profile.sub),
            ),
          )
          .limit(1)
        if (existing.length > 0) return {} // returning user → login, not signup

        if ((await userCount()) === 0) return {} // first user → admin

        const forbid = (message: string) => {
          throw new APIError('FORBIDDEN', { message })
        }
        if (!(await registrationEnabled()))
          forbid('Registration is disabled on this Vault.')
        if (
          ALLOWED_TWITCH_USER_IDS.length > 0 &&
          !ALLOWED_TWITCH_USER_IDS.includes(profile.sub)
        )
          forbid('This Twitch account is not allowed to use Vault.')
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
        // First user becomes admin — standard self-hosted-app convention.
        before: async (u) => ({
          data: { ...u, role: (await userCount()) === 0 ? 'admin' : 'user' },
        }),
      },
    },
  },
  plugins: [tanstackStartCookies()],
})
