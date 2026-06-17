import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { X } from 'lucide-react'
import { fetchSession } from '#/lib/session'
import { getWatchData } from '#/server/progress'
import { listVods } from '#/server/vods'
import { TwitchPlayer } from '#/components/twitch-player'
import { thumbnail, timeAgo } from '#/lib/format'

export const Route = createFileRoute('/split')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { a?: string; b?: string } => ({
    // Twitch video ids are all-digits, so the parser coerces them to numbers;
    // force back to string.
    a: search.a != null ? String(search.a) : undefined,
    b: search.b != null ? String(search.b) : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const session = await fetchSession()
    if (!session) throw redirect({ to: '/login' })
    if (!search.a) throw redirect({ to: '/' })
  },
  component: Split,
})

function Split() {
  const { a, b } = Route.useSearch()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black md:flex-row">
      <Pane videoId={a!} />
      {b ? (
        <Pane videoId={b} closeTo={{ a }} />
      ) : (
        <Picker excludeId={a!} />
      )}

      {/* Exit split */}
      <Link
        to="/watch/$videoId"
        params={{ videoId: a! }}
        className="absolute left-3 top-3 z-10 rounded-md bg-black/70 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-black/90"
      >
        ← Exit split
      </Link>
    </div>
  )
}

function Pane({
  videoId,
  closeTo,
}: {
  videoId: string
  closeTo?: { a?: string }
}) {
  const q = useQuery({
    queryKey: ['watch', videoId],
    queryFn: () => getWatchData({ data: videoId }),
  })

  return (
    <div className="relative h-1/2 w-full md:h-full md:flex-1">
      {q.data ? (
        <TwitchPlayer
          videoId={q.data.twitchVideoId}
          vodId={q.data.id}
          initialPosition={q.data.position ?? 0}
          duration={q.data.durationSeconds ?? 0}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-white/60">
          Loading…
        </div>
      )}
      {closeTo ? (
        <Link
          to="/split"
          search={closeTo}
          title="Close this pane"
          className="absolute right-3 top-3 z-10 rounded-md bg-black/70 p-1.5 text-white backdrop-blur hover:bg-black/90"
        >
          <X className="size-4" />
        </Link>
      ) : null}
    </div>
  )
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function Picker({ excludeId }: { excludeId: string }) {
  const [sameTimeframe, setSameTimeframe] = useState(true)
  const vods = useQuery({ queryKey: ['vods'], queryFn: () => listVods() })

  const all = vods.data ?? []
  const anchor = all.find((v) => v.twitchVideoId === excludeId)
  const anchorTime = anchor?.publishedAt
    ? new Date(anchor.publishedAt).getTime()
    : null

  const items = all.filter((v) => {
    if (v.twitchVideoId === excludeId) return false
    if (!sameTimeframe || anchorTime == null || !v.publishedAt) return true
    // Within ±1 day of the first VOD — same roleplay session, different POV.
    return Math.abs(new Date(v.publishedAt).getTime() - anchorTime) <= ONE_DAY_MS
  })

  return (
    <div className="h-1/2 w-full overflow-y-auto bg-background p-4 md:h-full md:w-96 md:flex-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Pick a second VOD</h2>
        <button
          type="button"
          onClick={() => setSameTimeframe((v) => !v)}
          className={
            sameTimeframe
              ? 'rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground'
              : 'rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent'
          }
          title="Limit to VODs within ±1 day of the first one"
        >
          {sameTimeframe ? 'Same timeframe' : 'All dates'}
        </button>
      </div>
      {sameTimeframe && items.length === 0 ? (
        <p className="mb-3 text-xs text-muted-foreground">
          No other VODs within ±1 day. Switch to “All dates”.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        {items.map((v) => (
          <Link
            key={v.id}
            to="/split"
            search={(prev) => ({ ...prev, b: v.twitchVideoId })}
            className="group flex flex-col gap-1"
          >
            <div className="aspect-video overflow-hidden rounded-md border bg-muted">
              {thumbnail(v.thumbnailUrl) ? (
                <img
                  src={thumbnail(v.thumbnailUrl)!}
                  alt=""
                  className="size-full object-cover transition-transform group-hover:scale-105"
                />
              ) : null}
            </div>
            <div className="line-clamp-1 text-xs font-medium">{v.title}</div>
            <div className="text-xs text-muted-foreground">
              {v.streamerName} · {timeAgo(v.publishedAt)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
