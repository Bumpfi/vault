import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchSession } from '#/lib/session'
import { listContinueWatching, listVods, refreshVods } from '#/server/vods'
import { getSettings } from '#/server/settings'
import { listLiveStreamerIds } from '#/server/streamers'
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
  const [category, setCategory] = useState<string | null>(null)

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
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
  })
  const liveQuery = useQuery({
    queryKey: ['live-streamers'],
    queryFn: () => listLiveStreamerIds(),
    refetchInterval: 60_000,
  })
  const live = useMemo(() => new Set(liveQuery.data ?? []), [liveQuery.data])

  // Apply saved dashboard defaults once, without clobbering later user changes.
  const appliedDefaults = useRef(false)
  useEffect(() => {
    if (settings.data && !appliedDefaults.current) {
      appliedDefaults.current = true
      setUnwatchedOnly(settings.data.unwatchedDefault)
      setCategory(settings.data.defaultCategory)
    }
  }, [settings.data])

  const refreshMut = useMutation({
    mutationFn: () => refreshVods(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vods'] })
      void qc.invalidateQueries({ queryKey: ['continue-watching'] })
    },
  })

  const categories = useMemo(
    () =>
      [
        ...new Set(vods.data?.map((v) => v.category).filter(Boolean)),
      ].sort() as Array<string>,
    [vods.data],
  )

  const inCategory = (c: string | null) => !category || c === category

  const streamers = useMemo(() => {
    const map = new Map<number, string>()
    vods.data
      ?.filter((v) => inCategory(v.category))
      .forEach((v) => map.set(v.streamerId, v.streamerName))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [vods.data, category])

  const filtered = useMemo(() => {
    return (vods.data ?? []).filter((v) => {
      if (!inCategory(v.category)) return false
      if (unwatchedOnly && v.watched) return false
      if (streamerId !== null && v.streamerId !== streamerId) return false
      return true
    })
  }, [vods.data, category, unwatchedOnly, streamerId])

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
                  <VodCard vod={v} live={live.has(v.streamerId)} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {categories.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label-caps">Category</span>
            <Button
              variant={category === null ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => {
                setCategory(null)
                setStreamerId(null)
              }}
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                variant={category === c ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setCategory(c)
                  setStreamerId(null)
                }}
              >
                {c}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant={unwatchedOnly ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => setUnwatchedOnly((v) => !v)}
          >
            Unwatched
          </Button>
          <div className="mx-2 h-5 w-px bg-border" />
          <Button
            variant={streamerId === null ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => setStreamerId(null)}
          >
            All
          </Button>
          {streamers.map(([id, name]) => (
            <Button
              key={id}
              variant={streamerId === id ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => setStreamerId(id)}
            >
              {live.has(id) ? (
                <span className="mr-1 size-1.5 animate-pulse rounded-full bg-destructive" />
              ) : null}
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {filtered.map((v) => (
              <VodCard key={v.id} vod={v} live={live.has(v.streamerId)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
