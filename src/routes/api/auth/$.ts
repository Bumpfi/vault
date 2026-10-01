import { createFileRoute } from '@tanstack/react-router'
import { auth } from '#/server/auth'

// Mounts Better Auth's endpoints (sign-in, OAuth callback, sign-out, …).
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})
