import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'

// Server-only. MUST only be called inside createServerFn handlers — that keeps
// the server-only import out of the client bundle (see import-protection).
export async function requireUserId(): Promise<string> {
  const { headers } = getRequest()
  const session = await auth.api.getSession({ headers })
  if (!session) throw new Error('Unauthorized')
  return session.user.id
}
