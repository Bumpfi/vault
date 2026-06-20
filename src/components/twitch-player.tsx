import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { RefreshCw } from 'lucide-react'
import { saveProgress } from '#/server/progress'
import { realClock } from '#/lib/format'

declare global {
  interface Window {
    Twitch?: {
      Player: {
        new (
          el: HTMLElement | string,
          opts: Record<string, unknown>,
        ): TwitchPlayerInstance
        READY: string
        SEEK: string
        PLAYING: string
        PAUSE: string
      }
    }
  }
}

interface TwitchPlayerInstance {
  addEventListener: (event: string, cb: () => void) => void
  seek: (seconds: number) => void
  getCurrentTime: () => number
  getDuration: () => number
}

// Imperative handle so a parent (e.g. split view) can read/seek this player.
export interface TwitchPlayerHandle {
  seek: (seconds: number) => void
  getCurrentTime: () => number
  streamStartMs: number | null
}

const EMBED_SRC = 'https://player.twitch.tv/js/embed/v1.js'
const TICK_MS = 1000
const SAVE_DELTA_S = 5

export const TwitchPlayer = forwardRef<
  TwitchPlayerHandle,
  {
    videoId: string
    vodId: number
    initialPosition: number
    duration: number
    onTime?: (seconds: number) => void
    // VOD stream-start time; enables the real-world clock overlay.
    streamStartedAt?: Date | string | null
    // When provided, shows a small "sync" button next to the clock.
    onSync?: () => void
  }
>(function TwitchPlayer(
  { videoId, vodId, initialPosition, duration, onTime, streamStartedAt, onSync },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<TwitchPlayerInstance | null>(null)
  const lastSaved = useRef(0)
  // Drives the real-world clock overlay (re-renders ~1/s).
  const [seconds, setSeconds] = useState(initialPosition)
  const [syncing, setSyncing] = useState(false)
  // Keep the latest onTime without re-running the player effect.
  const onTimeRef = useRef(onTime)
  onTimeRef.current = onTime

  const streamStartMs = streamStartedAt
    ? new Date(streamStartedAt).getTime()
    : null

  useImperativeHandle(
    ref,
    () => ({
      seek: (s: number) => playerRef.current?.seek(Math.max(0, s)),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      streamStartMs,
    }),
    [streamStartMs],
  )

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    const persist = () => {
      const p = playerRef.current
      if (!p) return
      const t = p.getCurrentTime()
      const d = p.getDuration() || duration || 0
      if (t > 0) void saveProgress({ data: { vodId, position: t, duration: d } })
    }

    const init = () => {
      if (cancelled || !containerRef.current || !window.Twitch) return
      const player = new window.Twitch.Player(containerRef.current, {
        video: videoId,
        parent: [window.location.hostname],
        width: '100%',
        height: '100%',
        autoplay: true,
      })
      playerRef.current = player
      player.addEventListener(window.Twitch.Player.READY, () => {
        if (initialPosition > 0) player.seek(initialPosition)
      })
      // Update the clock the instant the user seeks/plays/pauses, so it's
      // accurate immediately instead of waiting for the next 1s tick.
      const sync = () => setSeconds(player.getCurrentTime())
      player.addEventListener(window.Twitch.Player.SEEK, sync)
      player.addEventListener(window.Twitch.Player.PLAYING, sync)
      player.addEventListener(window.Twitch.Player.PAUSE, sync)
      interval = setInterval(() => {
        const t = player.getCurrentTime()
        if (t <= 0) return
        setSeconds(t)
        onTimeRef.current?.(t)
        if (Math.abs(t - lastSaved.current) >= SAVE_DELTA_S) {
          lastSaved.current = t
          persist()
        }
      }, TICK_MS)
    }

    if (window.Twitch?.Player) {
      init()
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${EMBED_SRC}"]`,
      )
      if (existing) existing.addEventListener('load', init)
      else {
        const script = document.createElement('script')
        script.src = EMBED_SRC
        script.async = true
        script.onload = init
        document.body.appendChild(script)
      }
    }

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      persist() // save final position on unmount
      playerRef.current = null
    }
  }, [videoId, vodId, initialPosition, duration])

  // Keep the clock live + visible in every state. Twitch's own fullscreen
  // button fullscreens its cross-origin iframe, over which our overlay can't
  // render — so redirect that to fullscreen OUR wrapper instead. Also re-sync
  // the time immediately on fullscreen / tab-visibility / focus changes.
  useEffect(() => {
    const resync = () => {
      const t = playerRef.current?.getCurrentTime()
      if (t && t > 0) setSeconds(t)
    }
    const onFullscreen = () => {
      const fsEl = document.fullscreenElement
      const wrapper = wrapperRef.current
      if (fsEl && wrapper && fsEl !== wrapper && wrapper.contains(fsEl)) {
        void document
          .exitFullscreen()
          .then(() => wrapper.requestFullscreen())
          .catch(() => {})
      }
      resync()
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [])

  const clock = streamStartedAt ? realClock(streamStartedAt, seconds) : null

  return (
    <div ref={wrapperRef} className="group relative size-full bg-black">
      <div ref={containerRef} className="size-full" />
      {/* Controls cluster, bottom-left next to Twitch's controls. Appears with
          the controls on hover; pointer-events-none so it never blocks them. */}
      <div className="pointer-events-none absolute bottom-2 left-[150px] z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        {clock ? (
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs tabular-nums text-white">
            {clock}
          </span>
        ) : null}
        {onSync ? (
          <button
            type="button"
            title="Sync to the left stream's real-world time"
            onClick={() => {
              onSync()
              setSyncing(true)
              setTimeout(() => setSyncing(false), 600)
            }}
            className="pointer-events-auto flex items-center justify-center rounded bg-black/70 p-1 text-white transition-colors hover:bg-primary hover:text-primary-foreground active:bg-primary"
          >
            <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        ) : null}
      </div>
    </div>
  )
})
