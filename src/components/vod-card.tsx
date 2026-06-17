import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import type { FeedVod } from '#/server/vods'
import { setWatched } from '#/server/progress'
import { formatDuration, thumbnail, timeAgo } from '#/lib/format'
import { cn } from '#/lib/utils'

export function VodCard({ vod }: { vod: FeedVod }) {
  const qc = useQueryClient()
  const thumb = thumbnail(vod.thumbnailUrl)

  const percent =
    vod.position && vod.durationSeconds
      ? Math.min(100, Math.round((vod.position / vod.durationSeconds) * 100))
      : 0

  const toggleWatched = useMutation({
    mutationFn: (next: boolean) =>
      setWatched({ data: { vodId: vod.id, watched: next } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vods'] })
      void qc.invalidateQueries({ queryKey: ['continue-watching'] })
    },
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
                vod.watched && 'opacity-40',
              )}
            />
          ) : null}

          {vod.durationSeconds ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
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
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50">
              <div
                className="h-full bg-red-500"
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
            <div className="line-clamp-2 text-sm font-medium" title={vod.title}>
              {vod.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {vod.streamerName}
            </div>
            <div className="text-xs text-muted-foreground">
              {timeAgo(vod.publishedAt)}
            </div>
          </div>
        </div>
      </Link>

      {/* Hover action: toggle watched without navigating */}
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
          'absolute right-1 top-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium opacity-0 shadow transition-opacity group-hover:opacity-100',
          vod.watched
            ? 'bg-background text-foreground hover:bg-accent'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        <Check className="size-3.5" />
        {vod.watched ? 'Unwatch' : 'Watched'}
      </button>
    </div>
  )
}
