import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

// Server functions are plain HTTP endpoints. Reject calls that don't come
// from this app's own pages (checked via Sec-Fetch-Site / Origin), so another
// site can't trigger them with the user's cookies.
const csrf = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf],
}))
