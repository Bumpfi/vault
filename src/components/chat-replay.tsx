import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getChatBadges, getVodChat } from '#/server/chat'
import type { ChatComment } from '#/server/chat'
import { realClock } from '#/lib/format'

const LOOKAHEAD_S = 60 // keep chat buffered this far ahead of playback
const SEEK_THRESHOLD_S = 5 // jump bigger than this = a seek, reset buffer
const MAX_VISIBLE = 250 // rendered messages kept in the DOM
const DRAIN_MS = 100 // how often due messages are released
const MAX_EXTRAPOLATE_S = 1.2 // trust interpolation only this far past a tick
const MAX_PAGES_PER_FILL = 5 // bound the catch-up loop for very fast chat
const MAX_SEEN = 20_000

const emoteUrl = (id: string) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`

export function ChatReplay({
  videoId,
  currentTime,
  streamStartedAt,
  broadcasterId,
}: {
  videoId: string
  currentTime: number
  streamStartedAt?: Date | string | null
  broadcasterId?: string | null
}) {
  const [visible, setVisible] = useState<Array<ChatComment>>([])
  const [error, setError] = useState<string | null>(null)
  const [pinned, setPinned] = useState(true) // following the newest messages

  // Fetch pipeline: messages arrive here, then drain into `visible` on time.
  const bufferRef = useRef<Array<ChatComment>>([])
  const seenRef = useRef(new Set<string>())
  const cursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(true)
  const fetchingRef = useRef(false)
  const coveredRef = useRef(-1) // max offset buffered
  const anchorRef = useRef(0) // earliest offset in the current buffer
  const prevTimeRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  // Playback clock: `currentTime` only ticks ~1/s, so we interpolate between
  // ticks to release messages continuously instead of in one-second clumps.
  const clockRef = useRef({ videoTime: 0, wallMs: Date.now() })

  const badges = useQuery({
    queryKey: ['chat-badges', broadcasterId],
    queryFn: () => getChatBadges({ data: broadcasterId as string }),
    enabled: !!broadcasterId,
    staleTime: 60 * 60 * 1000,
  })
  const badgeMap = badges.data

  const playhead = () => {
    const { videoTime, wallMs } = clockRef.current
    const drift = (Date.now() - wallMs) / 1000
    return videoTime + Math.min(drift, MAX_EXTRAPOLATE_S)
  }

  const ingest = (res: {
    comments: Array<ChatComment>
    cursor: string | null
    hasMore: boolean
  }) => {
    cursorRef.current = res.cursor
    hasMoreRef.current = res.hasMore
    if (res.comments.length === 0) return
    // ponytail: dedupe by id — offset pages can overlap at the seams.
    if (seenRef.current.size > MAX_SEEN) seenRef.current.clear()
    const fresh = res.comments.filter((c) => !seenRef.current.has(c.id))
    for (const c of fresh) seenRef.current.add(c.id)
    coveredRef.current = Math.max(
      coveredRef.current,
      res.comments[res.comments.length - 1].offset,
    )
    if (fresh.length === 0) return
    bufferRef.current.push(...fresh)
    bufferRef.current.sort((a, b) => a.offset - b.offset)
  }

  // Pull pages until the buffer covers playhead + LOOKAHEAD_S. Looping here
  // (instead of one page per tick) is what keeps up with fast chat.
  const ensureBuffered = async (t: number) => {
    if (fetchingRef.current) return
    if (!hasMoreRef.current) return
    if (coveredRef.current >= t + LOOKAHEAD_S) return
    fetchingRef.current = true
    try {
      for (let i = 0; i < MAX_PAGES_PER_FILL; i++) {
        if (!hasMoreRef.current) break
        if (coveredRef.current >= t + LOOKAHEAD_S) break
        ingest(
          await getVodChat({
            data: { videoId, cursor: cursorRef.current ?? undefined },
          }),
        )
      }
      setError(null)
    } catch (e) {
      setError(String(e))
      hasMoreRef.current = false
    } finally {
      fetchingRef.current = false
    }
  }

  // Reset the pipeline and refetch from an offset (mount + seek).
  const resetTo = async (offset: number) => {
    cursorRef.current = null
    hasMoreRef.current = true
    coveredRef.current = offset - 1
    anchorRef.current = offset
    bufferRef.current = []
    seenRef.current = new Set()
    setVisible([])
    fetchingRef.current = true
    try {
      ingest(await getVodChat({ data: { videoId, offsetSeconds: offset } }))
      setError(null)
    } catch (e) {
      setError(String(e))
      hasMoreRef.current = false
    } finally {
      fetchingRef.current = false
    }
  }

  // Initial load + reset when the VOD changes.
  useEffect(() => {
    prevTimeRef.current = 0
    clockRef.current = { videoTime: 0, wallMs: Date.now() }
    void resetTo(0)
  }, [videoId])

  // Re-anchor the interpolated clock on every real tick; detect seeks.
  useEffect(() => {
    const t = currentTime
    const prev = prevTimeRef.current
    prevTimeRef.current = t
    if (t <= 0) return
    clockRef.current = { videoTime: t, wallMs: Date.now() }

    if (t + 0.5 < anchorRef.current || Math.abs(t - prev) > SEEK_THRESHOLD_S) {
      void resetTo(Math.max(0, Math.floor(t)))
    }
  }, [currentTime])

  // Release due messages continuously and keep the buffer topped up.
  useEffect(() => {
    const id = setInterval(() => {
      const t = playhead()
      const buf = bufferRef.current
      let n = 0
      while (n < buf.length && buf[n].offset <= t) n++
      if (n > 0) {
        const due = buf.splice(0, n)
        setVisible((prev) => {
          const next = prev.concat(due)
          return next.length > MAX_VISIBLE
            ? next.slice(next.length - MAX_VISIBLE)
            : next
        })
      }
      void ensureBuffered(t)
    }, DRAIN_MS)
    return () => clearInterval(id)
  }, [videoId])

  // Auto-scroll only while the user is at the bottom (native chat behaviour).
  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [visible])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    atBottomRef.current = atBottom
    setPinned(atBottom)
  }

  const jumpToLatest = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setPinned(true)
  }

  const synced = realClock(streamStartedAt ?? null, currentTime)

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
          {error ? (
            <p className="text-xs text-destructive">
              Chat unavailable (the unofficial endpoint may have changed).
            </p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {currentTime > 0 ? 'No chat yet…' : 'Waiting for playback…'}
            </p>
          ) : (
            visible.map((c) => (
              <div key={c.id} className="leading-snug break-words">
                {streamStartedAt ? (
                  <span className="mr-1.5 font-mono text-[10px] text-faint">
                    {realClock(streamStartedAt, c.offset)}
                  </span>
                ) : null}
                {c.badges.map((b) => {
                  const info = badgeMap?.[b.setID]?.[b.version]
                  if (!info) return null
                  return (
                    <img
                      key={`${b.setID}/${b.version}`}
                      src={info.url}
                      srcSet={`${info.url} 1x, ${info.url2x} 2x`}
                      alt={info.title}
                      title={info.title}
                      loading="lazy"
                      decoding="async"
                      className="mr-1 inline-block size-[18px] align-[-4px]"
                    />
                  )
                })}
                <span
                  className="font-semibold"
                  style={{ color: c.color ?? undefined }}
                >
                  {c.name}
                </span>
                <span className="text-muted-foreground">: </span>
                {c.fragments.map((f, i) =>
                  f.emoteId ? (
                    <img
                      key={i}
                      src={emoteUrl(f.emoteId)}
                      alt={f.text}
                      title={f.text}
                      loading="lazy"
                      decoding="async"
                      className="mx-0.5 inline-block h-5 rounded-sm bg-primary/10 align-middle"
                    />
                  ) : (
                    <span key={i}>{f.text}</span>
                  ),
                )}
              </div>
            ))
          )}
        </div>
        {!pinned ? (
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
