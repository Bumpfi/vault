import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { account } from '#/db/schema'

// Keep the single user's Twitch OAuth token fresh so follows import keeps
// working between logins. (Public VOD reads use the app token, not this.)
export async function refreshUserToken() {
  const rows = await db
    .select()
    .from(account)
    .where(eq(account.providerId, 'twitch'))
  const acc = rows[0]
  if (!acc?.refreshToken) {
    console.log('[token-refresh] no Twitch account yet, skipping')
    return
  }

  // Only refresh when within an hour of expiry.
  if (
    acc.accessTokenExpiresAt &&
    acc.accessTokenExpiresAt.getTime() > Date.now() + 3_600_000
  ) {
    return
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: acc.refreshToken,
    }),
  })

  if (!res.ok) {
    console.error(`[token-refresh] ${res.status}: ${await res.text()}`)
    return
  }

  const d = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  await db
    .update(account)
    .set({
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? acc.refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + d.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(account.id, acc.id))
  console.log('[token-refresh] refreshed Twitch user token')
}
