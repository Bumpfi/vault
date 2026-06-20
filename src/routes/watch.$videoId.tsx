import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchSession } from '#/lib/session'
import { getWatchData, setWatched } from '#/server/progress'
import { AppHeader } from '#/components/app-header'
import { TwitchPlayer } from '#/components/twitch-player'
import { ChatReplay } from '#/components/chat-replay'
import { Button } from '#/components/ui/button'

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
      <main className="mx-auto max-w-7xl p-6">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="aspect-video w-full flex-1 overflow-hidden rounded-lg border bg-black">
            <TwitchPlayer
              videoId={data.twitchVideoId}
              vodId={data.id}
              initialPosition={data.position ?? 0}
              duration={data.durationSeconds ?? 0}
              streamStartedAt={data.createdAtTwitch}
              onTime={setCurrentTime}
            />
          </div>
          {showChat ? (
            <aside className="relative h-72 w-full overflow-hidden rounded-lg border bg-card lg:h-auto lg:w-[340px] lg:flex-none lg:self-stretch">
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
      </main>
    </div>
  )
}
