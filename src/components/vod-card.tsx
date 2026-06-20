import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCheck, Film } from 'lucide-react'
import type { FeedVod } from '#/server/vods'
import { markOlderWatched, setWatched } from '#/server/progress'
import { formatDuration, hueFromString, thumbnail, timeAgo } from '#/lib/format'
import { cn } from '#/lib/utils'

export function VodCard({ vod }: { vod: FeedVod }) {
  const qc = useQueryClient()
  const thumb = thumbnail(vod.thumbnailUrl)

  const percent =
    vod.position && vod.durationSeconds
      ? Math.min(100, Math.round((vod.position / vod.durationSeconds) * 100))
      : 0

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['vods'] })
    void qc.invalidateQueries({ queryKey: ['continue-watching'] })
  }

  const toggleWatched = useMutation({
    mutationFn: (next: boolean) =>
      setWatched({ data: { vodId: vod.id, watched: next } }),
    onSuccess: invalidate,
  })

  const markOlder = useMutation({
    mutationFn: () => markOlderWatched({ data: vod.id }),
    onSuccess: invalidate,
  })

  return (
    <div className="group relative flex flex-col gap-2">
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
              className={cn(
                'size-full object-cover transition-transform group-hover:scale-105',
                vod.watched && 'opacity-[0.32]',
              )}
            />
          ) : (
            <div
              className={cn(
                'flex size-full items-center justify-center',
                vod.watched && 'opacity-[0.32]',
              )}
              style={{
                background: `linear-gradient(150deg, hsl(${hueFromString(vod.streamerName)} 50% 38% / 0.6), hsl(${hueFromString(vod.streamerName)} 40% 18% / 0.3) 44%, #0b0b0d 92%)`,
              }}
            >
              <Film className="size-8 text-white/25" />
            </div>
          )}

          {vod.durationSeconds ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/[0.74] px-1.5 py-0.5 font-mono text-xs font-medium text-white">
              {formatDuration(vod.durationSeconds)}
            </span>
          ) : null}

          {vod.watched ? (
            <span className="absolute left-1 top-1 flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
              <Check className="size-3.5" />
              Watched
            </span>
          ) : null}

          {/* Resume progress bar */}
          {!vod.watched && percent > 0 ? (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
              <div
                className="h-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          {vod.profileImageUrl ? (
            <img
              src={vod.profileImageUrl}
              alt=""
              className="mt-0.5 size-8 shrink-0 rounded-full"
            />
          ) : null}
          <div className="min-w-0">
            <div
              className={cn(
                'line-clamp-2 text-sm font-semibold',
                vod.watched && 'text-[#7d7b76]',
              )}
              title={vod.title}
            >
              {vod.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {vod.streamerName}
            </div>
            <div className="font-mono text-[11px] text-faint">
              {timeAgo(vod.publishedAt)}
            </div>
          </div>
        </div>
      </Link>

      {/* Hover actions (don't navigate) */}
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Mark this and all older VODs from this streamer as watched"
          disabled={markOlder.isPending}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            markOlder.mutate()
          }}
          className="flex items-center justify-center rounded-md border border-white/10 bg-black/50 p-1.5 text-white shadow backdrop-blur-sm hover:bg-black/70"
        >
          <CheckCheck className="size-3.5" />
        </button>
        <button
          type="button"
          title={vod.watched ? 'Mark unwatched' : 'Mark watched'}
          disabled={toggleWatched.isPending}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toggleWatched.mutate(!vod.watched)
          }}
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
