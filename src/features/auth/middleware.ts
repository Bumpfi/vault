import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/server/auth'

// Server-function middleware. This is the actual authorization boundary:
// route guards only decide what to render, while every server function that
// touches user data runs through one of these. The `.server()` bodies are
// stripped from the client bundle at build time.

/** Rejects anonymous calls and puts the signed-in user on `context.user`. */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session) throw new Error('Unauthorized')
    return next({ context: { user: session.user } })
  },
)

/** Like `authMiddleware`, but only for admins. */
export const adminMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (context.user.role !== 'admin') throw new Error('Forbidden')
    return next()
  })
