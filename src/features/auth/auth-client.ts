import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()

/**
 * Signs out, then does a full page load to /login. The hard reload drops every
 * cached query, so nothing from this user's session survives into the next.
 */
export async function signOut() {
  await authClient.signOut()
  window.location.assign('/login')
}
