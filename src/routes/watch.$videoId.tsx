import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchSession } from '#/lib/session'
import { getWatchData, setWatched } from '#/server/progress'
import { getVodChapters } from '#/server/chat'
import { recoverVod } from '#/server/recovery'
import { AppHeader } from '#/components/app-header'
import { TwitchPlayer } from '#/components/twitch-player'
import type { TwitchPlayerHandle } from '#/components/twitch-player'
import { ChatReplay } from '#/components/chat-replay'
import { HlsPlayer } from '#/components/hls-player'
import { Button } from '#/components/ui/button'
import { formatTimestamp } from '#/lib/format'

export const Route = createFileRoute('/watch/$videoId')({
  beforeLoad: async () => {
    const session = await fetchSession()
    if (!session) throw redirect({ to: '/login' })
  },
  loader: ({ params }) => getWatchData({ data: params.videoId }),
  component: Watch,
})

function Watch() {
  const data = Route.useLoaderData()
  const [watched, setWatchedState] = useState(data?.watched ?? false)
  const [showChat, setShowChat] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [recoveredUrl, setRecoveredUrl] = useState<string | null>(null)
  const playerRef = useRef<TwitchPlayerHandle>(null)

  const recoverMut = useMutation({
    mutationFn: () => recoverVod({ data: data.id }),
    onSuccess: (r) => setRecoveredUrl(r.url),
  })

  const chapters = useQuery({
    queryKey: ['chapters', data?.twitchVideoId],
    queryFn: () => getVodChapters({ data: data.twitchVideoId }),
    enabled: !!data,
  })

  if (!data) {
    return (
      <div>
        <AppHeader />
        <p className="p-6 text-sm text-muted-foreground">
          VOD not found. It may not have been ingested yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <AppHeader />
      <main className="px-4 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:justify-center">
          <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black lg:h-[calc(100vh-7rem)] lg:w-auto lg:max-w-full lg:flex-none">
            {data.isAvailable ? (
              <TwitchPlayer
                ref={playerRef}
                videoId={data.twitchVideoId}
                vodId={data.id}
                initialPosition={data.position ?? 0}
                duration={data.durationSeconds ?? 0}
                streamStartedAt={data.createdAtTwitch}
                onTime={setCurrentTime}
              />
            ) : recoveredUrl ? (
              <HlsPlayer src={recoveredUrl} />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm font-medium">
                  This VOD was deleted from Twitch.
                </p>
                <Button
                  size="sm"
                  onClick={() => recoverMut.mutate()}
                  disabled={recoverMut.isPending}
                >
                  {recoverMut.isPending
                    ? 'Searching Twitch’s CDN…'
                    : 'Try to recover'}
                </Button>
                {recoverMut.isSuccess && !recoverMut.data?.url ? (
                  <p className="max-w-sm text-xs text-faint">
                    Couldn’t recover — the segments are no longer on Twitch’s
                    CDN. Recovery only works for recently-deleted VODs.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          {data.isAvailable && showChat ? (
            <aside className="relative h-72 w-full overflow-hidden rounded-lg border bg-card lg:h-auto lg:w-[360px] lg:flex-none lg:self-stretch">
              {/* absolute inner so chat content height never grows the row */}
              <div className="absolute inset-0">
                <ChatReplay
                  videoId={data.twitchVideoId}
                  currentTime={currentTime}
                  streamStartedAt={data.createdAtTwitch}
                />
              </div>
            </aside>
          ) : null}
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold">{data.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={showChat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowChat((v) => !v)}
            >
              Chat
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/split" search={{ a: data.twitchVideoId }}>
                Split view
              </Link>
            </Button>
            <Button
              variant={watched ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                const next = !watched
                setWatchedState(next)
                void setWatched({ data: { vodId: data.id, watched: next } })
              }}
            >
              {watched ? 'Watched' : 'Mark watched'}
            </Button>
          </div>
        </div>

        {chapters.data && chapters.data.length > 0 ? (
          <div className="mt-5">
            <div className="label-caps mb-2">Chapters</div>
            <div className="flex flex-wrap gap-2">
              {chapters.data.map((ch, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => playerRef.current?.seek(ch.positionSeconds)}
                  className="flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs transition-colors hover:bg-accent"
                >
                  <span className="font-mono text-faint">
                    {formatTimestamp(ch.positionSeconds)}
                  </span>
                  <span className="font-medium">{ch.game}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
