import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Suspense, lazy, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { AppHeader } from '#/components/app-header'
import { Button } from '#/components/ui/button'
import { ChatReplay } from '#/features/chat/chat-replay'
import { getChapters } from '#/features/chat/functions'
import { TwitchPlayer } from '#/features/watch/twitch-player'
import type { TwitchPlayerHandle } from '#/features/watch/twitch-player'
import { getWatchData, recoverVod, setWatched } from '#/features/watch/functions'
import { formatTimestamp } from '#/lib/format'

// hls.js is large and only needed to play recovered (deleted) VODs, so it's
// loaded on demand instead of with every watch page.
const HlsPlayer = lazy(() =>
  import('#/features/watch/hls-player').then((m) => ({ default: m.HlsPlayer })),
)

export const Route = createFileRoute('/_authed/watch/$videoId')({
  loader: ({ params }) => getWatchData({ data: params.videoId }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.title} — Vault` : 'Vault' }],
  }),
  component: Watch,
})

function Watch() {
  const vod = Route.useLoaderData()
  if (!vod) {
    return (
      <div>
        <AppHeader />
        <p className="p-6 text-sm text-muted-foreground">
          VOD not found. It may not have been fetched yet.
        </p>
      </div>
    )
  }
  // Keyed so all player/chat state resets when navigating to another VOD.
  return <WatchPage key={vod.id} vod={vod} />
}

type WatchData = NonNullable<ReturnType<typeof Route.useLoaderData>>

function WatchPage({ vod }: { vod: WatchData }) {
  const [watched, setWatchedState] = useState(!!vod.watched)
  const [showChat, setShowChat] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const playerRef = useRef<TwitchPlayerHandle>(null)

  const chapters = useQuery({
    queryKey: ['chapters', vod.twitchVideoId],
    queryFn: () => getChapters({ data: vod.twitchVideoId }),
  })
  const recover = useMutation({ mutationFn: () => recoverVod({ data: vod.id }) })
  const toggleWatched = useMutation({
    mutationFn: (next: boolean) => setWatched({ data: { vodId: vod.id, watched: next } }),
    onMutate: (next) => setWatchedState(next),
  })

  return (
    <div>
      <AppHeader />
      <main className="px-4 py-4">
        {/* Theater layout. On wide screens the player takes the largest 16:9
            size that fits both the viewport height and the width left over
            for chat, so it never overflows and doesn't resize when chat is
            toggled. 2.5rem = horizontal page padding + gap. */}
        <div className="flex flex-col gap-2 [--chat-w:360px] lg:flex-row lg:justify-center">
          <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black lg:h-[min(calc(100vh_-_7rem),calc((100vw_-_var(--chat-w)_-_2.5rem)*9/16))] lg:w-auto lg:flex-none">
            {vod.isAvailable ? (
              <TwitchPlayer
                ref={playerRef}
                videoId={vod.twitchVideoId}
                vodId={vod.id}
                initialPosition={vod.position ?? 0}
                duration={vod.durationSeconds ?? 0}
                streamStartedAt={vod.createdAtTwitch}
                onTime={setCurrentTime}
              />
            ) : recover.data?.url ? (
              <Suspense>
                <HlsPlayer src={recover.data.url} />
              </Suspense>
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm font-medium">This VOD was deleted from Twitch.</p>
                <Button
                  size="sm"
                  onClick={() => recover.mutate()}
                  disabled={recover.isPending}
                >
                  {recover.isPending ? 'Searching Twitch’s CDN…' : 'Try to recover'}
                </Button>
                {recover.isSuccess && !recover.data.url ? (
                  <p className="max-w-sm text-xs text-faint">
                    Couldn’t recover it — Twitch has already removed the video files.
                    Recovery only works shortly after a VOD is deleted.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {vod.isAvailable && showChat ? (
            <aside className="relative h-72 w-full overflow-hidden rounded-lg border bg-card lg:h-auto lg:w-(--chat-w) lg:flex-none lg:self-stretch">
              {/* Absolutely positioned so a long chat can't stretch the row. */}
              <div className="absolute inset-0">
                <ChatReplay
                  videoId={vod.twitchVideoId}
                  currentTime={currentTime}
                  streamStartedAt={vod.createdAtTwitch}
                  broadcasterId={vod.broadcasterId}
                />
              </div>
            </aside>
          ) : null}
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold">{vod.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={showChat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowChat((v) => !v)}
            >
              Chat
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/split" search={{ a: vod.twitchVideoId }}>
                Split view
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              {/* Saves the whole VOD as a single video file. */}
              <a href={`/api/download/${vod.id}`} download>
                <Download className="size-4" />
                Download
              </a>
            </Button>
            <Button
              variant={watched ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleWatched.mutate(!watched)}
            >
              {watched ? 'Watched' : 'Mark watched'}
            </Button>
          </div>
        </div>

        {chapters.data?.length ? (
          <div className="mt-5">
            <div className="label-caps mb-2">Chapters</div>
            <div className="flex flex-wrap gap-2">
              {chapters.data.map((ch) => (
                <button
                  key={ch.positionSeconds}
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
