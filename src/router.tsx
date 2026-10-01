import { createRouter, Link } from '@tanstack/react-router'
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

function ErrorScreen({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <pre className="max-w-xl overflow-x-auto rounded-md border bg-card p-3 text-left text-xs text-destructive">
        {error.message}
      </pre>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Reload
      </button>
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
      <h1 className="text-xl font-bold">Page not found</h1>
      <Link to="/" className="text-sm text-primary underline">
        Back to your feed
      </Link>
    </div>
  )
}

// Called once per request on the server and once in the browser, so every
// request gets its own query cache — no data leaks between users during SSR.
export function getRouter() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      // The session expired while the app was open: start over at login.
      onError: (error) => {
        if (typeof window !== 'undefined' && error.message === 'Unauthorized') {
          window.location.assign('/login')
        }
      },
    }),
    // Without this, every window focus refetches every query.
    defaultOptions: { queries: { staleTime: 30_000 } },
  })

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErrorScreen,
    defaultNotFoundComponent: NotFound,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
