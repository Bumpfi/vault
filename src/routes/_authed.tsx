import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCurrentUser } from '#/features/auth/functions'

// Pathless layout route: every route under routes/_authed/ requires a
// signed-in user and receives it as `context.user`. This only controls what
// renders; the server functions enforce access on their own.
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    // Cached, so client-side navigation doesn't hit the server every time.
    const user = await context.queryClient.ensureQueryData({
      queryKey: ['current-user'],
      queryFn: () => getCurrentUser(),
    })
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
})
