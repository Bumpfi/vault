import { useEffect, useMemo, useRef, useState } from 'react'
import { getVodChat, type ChatComment } from '#/server/chat'

const LOOKAHEAD_S = 30 // keep chat buffered this far ahead of playback
const SEEK_THRESHOLD_S = 5 // jump bigger than this = a seek, reset buffer
const MAX_VISIBLE = 200

const emoteUrl = (id: string) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`

export function ChatReplay({
  videoId,
  currentTime,
}: {
  videoId: string
  currentTime: number
}) {
  const [comments, setComments] = useState<Array<ChatComment>>([])
  const [error, setError] = useState<string | null>(null)

  const cursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(true)
  const fetchingRef = useRef(false)
  const coveredRef = useRef(-1) // max offset buffered
  const anchorRef = useRef(0) // earliest offset in buffer
  const prevTimeRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchMore = async (fromOffset?: number) => {
    if (fetchingRef.current) return
    if (fromOffset == null && !hasMoreRef.current) return
    fetchingRef.current = true
    try {
      const res = await getVodChat({
        data: {
          videoId,
          offsetSeconds: fromOffset,
          cursor: fromOffset == null ? (cursorRef.current ?? undefined) : undefined,
        },
      })
      cursorRef.current = res.cursor
      hasMoreRef.current = res.hasMore
      if (res.comments.length > 0) {
        coveredRef.current = Math.max(
          coveredRef.current,
          res.comments[res.comments.length - 1].offset,
        )
        setComments((prev) =>
          fromOffset == null ? [...prev, ...res.comments] : res.comments,
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

  // Reset state and refetch from a new offset (used on seek + on mount).
  const resetTo = (offset: number) => {
    cursorRef.current = null
    hasMoreRef.current = true
    coveredRef.current = offset - 1
    anchorRef.current = offset
    void fetchMore(offset)
  }

  // Initial load + reset when the VOD changes.
  useEffect(() => {
    setComments([])
    prevTimeRef.current = 0
    resetTo(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  // React to playback time: detect seeks, keep buffering ahead.
  useEffect(() => {
    const t = currentTime
    const prev = prevTimeRef.current
    prevTimeRef.current = t
    if (t <= 0) return

    if (t + 0.5 < anchorRef.current || Math.abs(t - prev) > SEEK_THRESHOLD_S) {
      resetTo(Math.max(0, Math.floor(t)))
      return
    }
    if (coveredRef.current < t + LOOKAHEAD_S) {
      void fetchMore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime])

  const visible = useMemo(
    () =>
      comments.filter((c) => c.offset <= currentTime).slice(-MAX_VISIBLE),
    [comments, currentTime],
  )

  // Auto-scroll to newest.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visible])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2 text-sm font-semibold">Chat</div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm"
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
                    className="inline-block h-5 align-middle"
                  />
                ) : (
                  <span key={i}>{f.text}</span>
                ),
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
