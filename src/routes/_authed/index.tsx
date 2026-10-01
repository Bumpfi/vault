import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AppHeader } from '#/components/app-header'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  listContinueWatching,
  listLiveStatus,
  listVods,
  refreshVods,
} from '#/features/feed/functions'
import { VodCard } from '#/features/feed/vod-card'
import type { FeedVod } from '#/features/feed/functions'
import { getSettings } from '#/features/settings/functions'
import { applyTheme } from '#/lib/theme'

export const Route = createFileRoute('/_authed/')({
  component: Feed,
})

const GRID =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6'

function Feed() {
  const qc = useQueryClient()
  const [category, setCategory] = useState<string | null>(null)
  const [streamerId, setStreamerId] = useState<number | null>(null)
  const [unwatchedOnly, setUnwatchedOnly] = useState(false)
  const [search, setSearch] = useState('')

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
  const live = useQuery({
    queryKey: ['live-status'],
    queryFn: () => listLiveStatus(),
    refetchInterval: 60_000,
  })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => getSettings() })

  // Apply the saved dashboard defaults once, then leave the filters alone.
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  useEffect(() => {
    if (!settings.data || defaultsApplied) return
    setDefaultsApplied(true)
    setCategory(settings.data.defaultCategory)
    setUnwatchedOnly(settings.data.unwatchedDefault)
    // The account's theme wins over whatever this browser remembered.
    applyTheme(settings.data.theme)
  }, [settings.data, defaultsApplied])

  const refresh = useMutation({
    mutationFn: () => refreshVods(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vods'] })
      void qc.invalidateQueries({ queryKey: ['continue-watching'] })
    },
  })

  const all = vods.data ?? []
  const liveStreamers = new Set(live.data?.streamerIds)
  const liveStreams = new Set(live.data?.streamIds)
  const isLive = (v: FeedVod) => !!v.streamId && liveStreams.has(v.streamId)

  const inCategory = (v: FeedVod) => !category || v.category === category
  const categories = [
    ...new Set(all.flatMap((v) => (v.category ? [v.category] : []))),
  ].sort()
  const streamers = [
    ...new Map(all.filter(inCategory).map((v) => [v.streamerId, v.streamerName])),
  ].sort((a, b) => a[1].localeCompare(b[1]))

  const query = search.trim().toLowerCase()
  const visible = all.filter(
    (v) =>
      inCategory(v) &&
      (!unwatchedOnly || !v.watched) &&
      (streamerId === null || v.streamerId === streamerId) &&
      (!query ||
        v.title.toLowerCase().includes(query) ||
        v.streamerName.toLowerCase().includes(query)),
  )

  const pickCategory = (c: string | null) => {
    setCategory(c)
    setStreamerId(null)
  }

  return (
    <div>
      <AppHeader />
      <main className="p-6">
        {continueWatching.data?.length ? (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">Continue watching</h2>
            <div className="flex gap-5 overflow-x-auto pb-2">
              {continueWatching.data.map((v) => (
                <div key={v.id} className="w-64 shrink-0">
                  <VodCard vod={v} live={isLive(v)} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {categories.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label-caps">Category</span>
            <Pill active={category === null} onClick={() => pickCategory(null)}>
              All
            </Pill>
            {categories.map((c) => (
              <Pill key={c} active={category === c} onClick={() => pickCategory(c)}>
                {c}
              </Pill>
            ))}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill active={unwatchedOnly} onClick={() => setUnwatchedOnly((v) => !v)}>
            Unwatched
          </Pill>
          <div className="mx-2 h-5 w-px bg-border" />
          <Pill active={streamerId === null} onClick={() => setStreamerId(null)}>
            All
          </Pill>
          {streamers.map(([id, name]) => (
            <Pill key={id} active={streamerId === id} onClick={() => setStreamerId(id)}>
              {liveStreamers.has(id) ? (
                <span className="mr-1 size-1.5 animate-pulse rounded-full bg-destructive" />
              ) : null}
              {name}
            </Pill>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <Input
              placeholder="Search VODs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-44"
            />
            {refresh.data ? (
              <span className="text-xs text-muted-foreground">
                Polled {refresh.data.polled} streamers
              </span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              {refresh.isPending ? 'Refreshing…' : 'Refresh VODs'}
            </Button>
          </div>
        </div>

        {vods.isPending ? (
          <div className={GRID}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="flex animate-pulse flex-col gap-2">
                <div className="aspect-video rounded-lg bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {all.length === 0
              ? 'No VODs yet. Import your follows in Settings and they will show up here.'
              : 'Nothing matches these filters.'}
          </p>
        ) : (
          <div className={GRID}>
            {visible.map((v) => (
              <VodCard key={v.id} vod={v} live={isLive(v)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      className="rounded-full"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
