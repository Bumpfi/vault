import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { APIError } from 'better-auth/api'
import { db } from '#/db'
import * as schema from '#/db/schema'

// Comma-separated Twitch user ids allowed to log in. Empty/unset = open
// signup (anyone with a Twitch account gets their own Vault).
const ALLOWED_TWITCH_USER_IDS = (process.env.ALLOWED_TWITCH_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // Single-user app: no email/password, only Twitch OAuth.
  socialProviders: {
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
      // Default scopes are user:read:email + openid. Add follows import.
      scope: ['user:read:follows'],
      // Allowlist gate: profile.sub is the Twitch numeric user id, available
      // before any user/account row is written. When an allowlist is set,
      // reject anyone not on it (no orphan rows are created). Empty list =
      // open signup.
      mapProfileToUser: (profile) => {
        if (
          ALLOWED_TWITCH_USER_IDS.length > 0 &&
          !ALLOWED_TWITCH_USER_IDS.includes(profile.sub)
        ) {
          throw new APIError('FORBIDDEN', {
            message: 'This Twitch account is not allowed to use Vault.',
          })
        }
        return {}
      },
    },
  },
  plugins: [tanstackStartCookies()],
})
