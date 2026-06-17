import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchSession } from '#/lib/session'
import { listContinueWatching, listVods, refreshVods } from '#/server/vods'
import { AppHeader } from '#/components/app-header'
import { VodCard } from '#/components/vod-card'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await fetchSession()
    if (!session) throw redirect({ to: '/login' })
  },
  component: Home,
})

function Home() {
  const qc = useQueryClient()
  const [unwatchedOnly, setUnwatchedOnly] = useState(false)
  const [streamerId, setStreamerId] = useState<number | null>(null)

  const vods = useQuery({
    queryKey: ['vods'],
    queryFn: () => listVods(),
    refetchOnMount: 'always',
  })
  const continueWatching = useQuery({
    queryKey: ['continue-watching'],
    queryFn: () => listContinueWatching(),
    refetchOnMount: 'always',
  })

  const refreshMut = useMutation({
    mutationFn: () => refreshVods(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vods'] })
      void qc.invalidateQueries({ queryKey: ['continue-watching'] })
    },
  })

  const streamers = useMemo(() => {
    const map = new Map<number, string>()
    vods.data?.forEach((v) => map.set(v.streamerId, v.streamerName))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [vods.data])

  const filtered = useMemo(() => {
    return (vods.data ?? []).filter((v) => {
      if (unwatchedOnly && v.watched) return false
      if (streamerId !== null && v.streamerId !== streamerId) return false
      return true
    })
  }, [vods.data, unwatchedOnly, streamerId])

  return (
    <div>
      <AppHeader />
      <main className="p-6">
        {continueWatching.data && continueWatching.data.length > 0 ? (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">Continue watching</h2>
            <div className="flex gap-5 overflow-x-auto pb-2">
              {continueWatching.data.map((v) => (
                <div key={v.id} className="w-64 shrink-0">
                  <VodCard vod={v} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant={unwatchedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnwatchedOnly((v) => !v)}
          >
            Unwatched
          </Button>
          <div className="mx-2 h-5 w-px bg-border" />
          <Button
            variant={streamerId === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStreamerId(null)}
          >
            All
          </Button>
          {streamers.map(([id, name]) => (
            <Button
              key={id}
              variant={streamerId === id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStreamerId(id)}
            >
              {name}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {refreshMut.data ? (
              <span className="text-xs text-muted-foreground">
                Polled {refreshMut.data.polled} streamers
              </span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
            >
              {refreshMut.isPending ? 'Refreshing…' : 'Refresh VODs'}
            </Button>
          </div>
        </div>

        {vods.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No VODs yet. Import follows in Settings, then the worker fills this
            feed.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((v) => (
              <VodCard key={v.id} vod={v} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
