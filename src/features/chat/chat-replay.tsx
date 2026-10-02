import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useHydrated } from '@tanstack/react-router'
import { ChatBuffer } from './chat-buffer'
import { getChatBadges, getChatPage } from './functions'
import type { ChatComment } from '#/server/twitch/gql'
import { realClock } from '#/lib/format'

const LOOKAHEAD_S = 60 // keep this much chat fetched ahead of playback
const SEEK_THRESHOLD_S = 5 // a bigger jump between ticks counts as a seek
const MAX_PAGES_PER_FILL = 5 // bounds catch-up on very busy chats
const RELEASE_INTERVAL_MS = 100
// The player reports its time about once a second. In between, playback is
// extrapolated — but only this far, so a paused player stops the chat.
const MAX_EXTRAPOLATION_S = 1.2
const MAX_RENDERED = 250

const emoteUrl = (id: string, scale: '1.0' | '2.0') =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/${scale}`

/**
 * Replays a VOD's chat in sync with the player. Remount it (via `key`) when
 * the video changes.
 */
export function ChatReplay({
  videoId,
  currentTime,
  streamStartedAt,
  broadcasterId,
}: {
  videoId: string
  currentTime: number
  streamStartedAt: Date | null
  broadcasterId: string
}) {
  const [messages, setMessages] = useState<Array<ChatComment>>([])
  const [failed, setFailed] = useState(false)
  const [following, setFollowing] = useState(true)

  const [buffer] = useState(() => new ChatBuffer())
  const fetching = useRef(false)
  // Bumped on every seek, so a page that was requested before the seek is
  // discarded instead of landing in the fresh buffer.
  const generation = useRef(0)
  const lastTick = useRef({ time: 0, at: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)

  const { data: badges } = useQuery({
    queryKey: ['chat-badges', broadcasterId],
    queryFn: () => getChatBadges({ data: broadcasterId }),
    staleTime: 60 * 60 * 1000,
  })

  const fill = async (playhead: number) => {
    if (fetching.current || failed) return
    fetching.current = true
    const gen = generation.current
    try {
      for (let i = 0; i < MAX_PAGES_PER_FILL; i++) {
        if (!buffer.needsMore(playhead, LOOKAHEAD_S)) break
        const page = await getChatPage({
          data: { videoId, from: buffer.nextPageStart() },
        })
        if (gen !== generation.current) return
        buffer.add(page)
      }
    } catch {
      if (gen === generation.current) setFailed(true)
    } finally {
      fetching.current = false
    }
  }

  // Each player tick re-anchors the clock; a large jump means the user seeked.
  useEffect(() => {
    if (currentTime <= 0) return
    const previous = lastTick.current.time
    lastTick.current = { time: currentTime, at: Date.now() }
    if (Math.abs(currentTime - previous) > SEEK_THRESHOLD_S) {
      generation.current++
      buffer.reset(Math.floor(currentTime))
      setMessages([])
      setFailed(false) // a seek is a natural point to retry after an error
    }
  }, [currentTime, buffer])

  // Release due messages several times a second instead of once per player
  // tick, so they stream in rather than arriving in one-second clumps.
  const release = useEffectEvent(() => {
    const { time, at } = lastTick.current
    if (at === 0) return // playback hasn't started
    const playhead = time + Math.min((Date.now() - at) / 1000, MAX_EXTRAPOLATION_S)
    const due = buffer.takeUntil(playhead)
    if (due.length > 0) {
      setMessages((prev) => [...prev, ...due].slice(-MAX_RENDERED))
    }
    void fill(playhead)
  })

  useEffect(() => {
    const id = setInterval(release, RELEASE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // Stick to the newest message unless the user scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setFollowing(atBottom.current)
  }

  const jumpToLatest = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    atBottom.current = true
    setFollowing(true)
  }

  // Wall-clock times use the viewer's time zone, unknown on the server.
  const hydrated = useHydrated()
  const synced = hydrated ? realClock(streamStartedAt, currentTime) : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="label-caps">Chat</span>
        {synced ? (
          <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            SYNCED {synced}
          </span>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full space-y-1.5 overflow-y-auto px-3 py-2 text-sm"
        >
          {failed ? (
            <p className="text-xs text-destructive">
              Chat replay is unavailable for this VOD.
            </p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {currentTime > 0 ? 'No chat yet…' : 'Waiting for playback…'}
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="leading-snug break-words">
                {streamStartedAt ? (
                  <span className="mr-1.5 font-mono text-[10px] text-faint">
                    {realClock(streamStartedAt, m.offset)}
                  </span>
                ) : null}
                {m.badges.map((b) => {
                  const badge = badges?.[b.setId]?.[b.version]
                  if (!badge) return null
                  return (
                    <img
                      key={`${b.setId}/${b.version}`}
                      src={badge.url}
                      srcSet={`${badge.url} 1x, ${badge.url2x} 2x`}
                      alt={badge.title}
                      title={badge.title}
                      className="mr-1 inline-block size-[18px] align-[-4px]"
                    />
                  )
                })}
                <span className="font-semibold" style={{ color: m.color ?? undefined }}>
                  {m.name}
                </span>
                <span className="text-muted-foreground">: </span>
                {m.fragments.map((f, i) =>
                  f.emoteId ? (
                    <img
                      key={i}
                      src={emoteUrl(f.emoteId, '1.0')}
                      srcSet={`${emoteUrl(f.emoteId, '1.0')} 1x, ${emoteUrl(f.emoteId, '2.0')} 2x`}
                      alt={f.text}
                      title={f.text}
                      className="mx-0.5 inline-block h-5 align-middle"
                    />
                  ) : (
                    <span key={i}>{f.text}</span>
                  ),
                )}
              </div>
            ))
          )}
        </div>

        {!following ? (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute inset-x-3 bottom-2 rounded-md bg-primary/90 px-2 py-1 text-xs font-semibold text-primary-foreground shadow hover:bg-primary"
          >
            Chat paused — jump to latest
          </button>
        ) : null}
      </div>

      <div className="border-t px-3 py-1.5 text-center text-[10px] text-faint">
        Replay only — chat is read-only
      </div>
    </div>
  )
}
