import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { Ref } from 'react'
import { Film, X } from 'lucide-react'
import { listVods } from '#/features/feed/functions'
import { getWatchData } from '#/features/watch/functions'
import { TwitchPlayer } from '#/features/watch/twitch-player'
import type { TwitchPlayerHandle } from '#/features/watch/twitch-player'
import { hueFromString, thumbnail, timeAgo } from '#/lib/format'

// Two VODs side by side, e.g. two perspectives of the same roleplay session.
// ?a= is the main VOD, ?b= the second one (picked from a list when absent).
export const Route = createFileRoute('/_authed/split')({
  // Twitch video ids are all digits, so the URL parser turns them into
  // numbers; convert back to strings.
  validateSearch: (search: Record<string, unknown>): { a?: string; b?: string } => ({
    a: search.a != null ? String(search.a) : undefined,
    b: search.b != null ? String(search.b) : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (!search.a) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Split view — Vault' }] }),
  component: Split,
})

const DAY_MS = 24 * 60 * 60 * 1000

function Split() {
  const { a = '', b } = Route.useSearch()
  const left = useRef<TwitchPlayerHandle>(null)
  const right = useRef<TwitchPlayerHandle>(null)

  // Seek the right player to the same real-world moment the left one shows.
  const syncToLeft = () => {
    const l = left.current
    const r = right.current
    if (l?.streamStartMs == null || r?.streamStartMs == null) return
    const momentMs = l.streamStartMs + l.getCurrentTime() * 1000
    r.seek((momentMs - r.streamStartMs) / 1000)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black md:flex-row">
      <Pane videoId={a} playerRef={left} />
      {b ? (
        <Pane videoId={b} playerRef={right} onSync={syncToLeft} closeTo={{ a }} />
      ) : (
        <Picker excludeId={a} />
      )}
      <Link
        to="/watch/$videoId"
        params={{ videoId: a }}
        className="absolute top-3 left-3 z-10 rounded-md bg-black/70 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-black/90"
      >
        ← Exit split
      </Link>
    </div>
  )
}

function Pane({
  videoId,
  playerRef,
  onSync,
  closeTo,
}: {
  videoId: string
  playerRef: Ref<TwitchPlayerHandle>
  onSync?: () => void
  closeTo?: { a: string }
}) {
  const { data: vod } = useQuery({
    queryKey: ['watch', videoId],
    queryFn: () => getWatchData({ data: videoId }),
  })

  return (
    <div className="relative h-1/2 w-full md:h-full md:flex-1">
      {vod ? (
        <TwitchPlayer
          key={vod.id}
          ref={playerRef}
          videoId={vod.twitchVideoId}
          vodId={vod.id}
          initialPosition={vod.position ?? 0}
          duration={vod.durationSeconds ?? 0}
          streamStartedAt={vod.createdAtTwitch}
          onSync={onSync}
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
          title="Close this side"
          className="absolute top-3 right-3 z-10 rounded-md bg-black/70 p-1.5 text-white backdrop-blur hover:bg-black/90"
        >
          <X className="size-4" />
        </Link>
      ) : null}
    </div>
  )
}

function Picker({ excludeId }: { excludeId: string }) {
  const [sameTimeframe, setSameTimeframe] = useState(true)
  const vods = useQuery({ queryKey: ['vods'], queryFn: () => listVods() })

  const all = vods.data ?? []
  const anchor = all.find((v) => v.twitchVideoId === excludeId)?.publishedAt
  const candidates = all.filter((v) => {
    if (v.twitchVideoId === excludeId) return false
    if (!sameTimeframe || !anchor || !v.publishedAt) return true
    // Within a day of the first VOD — likely the same event from another POV.
    return Math.abs(v.publishedAt.getTime() - anchor.getTime()) <= DAY_MS
  })

  return (
    <div className="h-1/2 w-full overflow-y-auto bg-background p-4 md:h-full md:w-96 md:flex-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Pick a second VOD</h2>
        <button
          type="button"
          onClick={() => setSameTimeframe((v) => !v)}
          title="Only show VODs within a day of the first one"
          className={
            sameTimeframe
              ? 'rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground'
              : 'rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent'
          }
        >
          {sameTimeframe ? 'Same timeframe' : 'All dates'}
        </button>
      </div>
      {sameTimeframe && candidates.length === 0 ? (
        <p className="mb-3 text-xs text-muted-foreground">
          No other VODs within a day. Switch to “All dates”.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        {candidates.map((v) => {
          const thumb = thumbnail(v.thumbnailUrl)
          return (
            <Link
              key={v.id}
              to="/split"
              search={(prev) => ({ ...prev, b: v.twitchVideoId })}
              className="group flex flex-col gap-1"
            >
              <div className="aspect-video overflow-hidden rounded-md border bg-muted">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="flex size-full items-center justify-center"
                    style={{
                      background: `linear-gradient(150deg, hsl(${hueFromString(v.streamerName)} 50% 38% / 0.6), #0b0b0d 92%)`,
                    }}
                  >
                    <Film className="size-6 text-white/25" />
                  </div>
                )}
              </div>
              <div className="line-clamp-1 text-xs font-medium">{v.title}</div>
              <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                {v.streamerName} · {timeAgo(v.publishedAt)}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
