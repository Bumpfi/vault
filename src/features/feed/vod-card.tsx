import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Check, CheckCheck, Film } from 'lucide-react'
import type { FeedVod } from './functions'
import { getCategories, markOlderWatched, setWatched } from '#/features/watch/functions'
import { formatDuration, hueFromString, thumbnail, timeAgo } from '#/lib/format'
import { cn } from '#/lib/utils'

const MAX_CATEGORIES = 3

export function VodCard({ vod, live = false }: { vod: FeedVod; live?: boolean }) {
  const qc = useQueryClient()
  const thumb = thumbnail(vod.thumbnailUrl)
  const dimmed = !!vod.watched || !vod.isAvailable
  const progress =
    vod.position && vod.durationSeconds
      ? Math.min(100, Math.round((vod.position / vod.durationSeconds) * 100))
      : 0

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['vods'] })
    void qc.invalidateQueries({ queryKey: ['continue-watching'] })
  }
  const toggleWatched = useMutation({
    mutationFn: (watched: boolean) => setWatched({ data: { vodId: vod.id, watched } }),
    onSuccess: refresh,
  })
  const markOlder = useMutation({
    mutationFn: () => markOlderWatched({ data: vod.id }),
    onSuccess: refresh,
  })

  // Categories are fetched when the card is hovered, after a short pause so
  // moving the mouse across the grid doesn't request every card. Shared
  // cache key with the watch page, so each VOD is fetched once.
  const [wantCategories, setWantCategories] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const categories = useQuery({
    queryKey: ['categories', vod.twitchVideoId],
    queryFn: () => getCategories({ data: vod.twitchVideoId }),
    enabled: wantCategories,
    staleTime: 30 * 60 * 1000,
  })
  const uniqueCategories = [
    ...new Map((categories.data ?? []).map((c) => [c.name, c])).values(),
  ]
  const hiddenCount = uniqueCategories.length - MAX_CATEGORIES

  const hue = hueFromString(vod.streamerName)

  return (
    <div
      className="group relative flex flex-col gap-2"
      onMouseEnter={() => {
        hoverTimer.current = setTimeout(() => setWantCategories(true), 150)
      }}
      onMouseLeave={() => clearTimeout(hoverTimer.current)}
    >
      <Link
        to="/watch/$videoId"
        params={{ videoId: vod.twitchVideoId }}
        className="flex flex-col gap-2"
      >
        <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn(
                'size-full object-cover transition-transform group-hover:scale-105',
                dimmed && 'opacity-30',
              )}
            />
          ) : (
            // No thumbnail yet (live or processing): streamer avatar on a
            // gradient tinted per streamer.
            <div
              className={cn(
                'flex size-full items-center justify-center',
                dimmed && 'opacity-30',
              )}
              style={{
                background: `linear-gradient(150deg, hsl(${hue} 50% 38% / 0.6), hsl(${hue} 40% 18% / 0.3) 44%, #0b0b0d 92%)`,
              }}
            >
              {vod.profileImageUrl ? (
                <img
                  src={vod.profileImageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-16 rounded-full object-cover opacity-90 grayscale-[0.6] transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                />
              ) : (
                <Film className="size-8 text-white/25" />
              )}
            </div>
          )}

          {uniqueCategories.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-1 bg-linear-to-t from-black/85 via-black/50 to-transparent px-1.5 pt-8 pr-14 pb-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              {uniqueCategories.slice(0, MAX_CATEGORIES).map((c) => (
                <span
                  key={c.name}
                  className="flex items-center gap-1 rounded bg-black/60 py-0.5 pr-1.5 pl-0.5 text-[11px] font-medium text-white"
                >
                  {c.boxArtUrl ? (
                    <img src={c.boxArtUrl} alt="" className="h-4 w-3 rounded-[2px]" />
                  ) : null}
                  <span className="max-w-36 truncate">{c.name}</span>
                </span>
              ))}
              {hiddenCount > 0 ? (
                <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  +{hiddenCount}
                </span>
              ) : null}
            </div>
          ) : null}

          {vod.durationSeconds ? (
            <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-xs font-medium text-white">
              {formatDuration(vod.durationSeconds)}
            </span>
          ) : null}

          {!vod.isAvailable ? (
            <span className="absolute top-1 left-1 rounded-md bg-destructive px-2 py-1 text-xs font-bold text-white shadow">
              Deleted
            </span>
          ) : vod.watched ? (
            <span className="absolute top-1 left-1 flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
              <Check className="size-3.5" />
              Watched
            </span>
          ) : null}

          {!vod.watched && progress > 0 ? (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          {vod.profileImageUrl ? (
            <img
              src={vod.profileImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="mt-0.5 size-8 shrink-0 rounded-full"
            />
          ) : null}
          <div className="min-w-0">
            <div
              title={vod.title}
              className={cn(
                'line-clamp-2 text-sm font-semibold',
                vod.watched && 'text-muted-foreground',
              )}
            >
              {vod.title}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {live ? (
                <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-destructive">
                  <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                  LIVE
                </span>
              ) : null}
              <span className="truncate">{vod.streamerName}</span>
            </div>
            <div className="font-mono text-[11px] text-faint" suppressHydrationWarning>
              {timeAgo(vod.publishedAt)}
            </div>
          </div>
        </div>
      </Link>

      {/* Hover actions. Siblings of the link, so clicking them doesn't navigate. */}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Mark this and every older VOD from this streamer as watched"
          disabled={markOlder.isPending}
          onClick={() => markOlder.mutate()}
          className="flex items-center justify-center rounded-md border border-white/10 bg-black/50 p-1.5 text-white shadow backdrop-blur-sm hover:bg-black/70"
        >
          <CheckCheck className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={toggleWatched.isPending}
          onClick={() => toggleWatched.mutate(!vod.watched)}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold shadow backdrop-blur-sm',
            vod.watched
              ? 'border border-white/10 bg-black/50 text-white hover:bg-black/70'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <Check className="size-3.5" />
          {vod.watched ? 'Unwatch' : 'Watched'}
        </button>
      </div>
    </div>
  )
}
