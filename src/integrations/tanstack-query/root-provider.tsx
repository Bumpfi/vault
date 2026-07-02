import { QueryClient } from '@tanstack/react-query'

export function getContext() {
  // 30s staleness: stops the default refetch-everything-on-window-focus storm.
  // Feed queries that must be fresh use refetchOnMount: 'always', which
  // bypasses staleTime.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
