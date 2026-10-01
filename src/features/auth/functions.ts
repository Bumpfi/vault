import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/server/auth'

export interface CurrentUser {
  id: string
  name: string
  image: string | null
  role: string
}

/**
 * The signed-in user, or null. Used by route guards. Returns only display
 * fields — the session object itself holds the session token, which must
 * never reach client-side JavaScript.
 */
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CurrentUser | null> => {
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session) return null
    const { id, name, image, role } = session.user
    return { id, name, image: image ?? null, role }
  },
)
