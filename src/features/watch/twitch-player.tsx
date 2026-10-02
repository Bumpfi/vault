import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useHydrated } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { saveProgress } from './functions'
import { realClock } from '#/lib/format'

// Minimal typing for Twitch's embed script (player.twitch.tv/js/embed/v1.js).
interface TwitchEmbedPlayer {
  addEventListener: (event: string, cb: () => void) => void
  seek: (seconds: number) => void
  getCurrentTime: () => number
  getDuration: () => number
}

declare global {
  interface Window {
    Twitch?: {
      Player: {
        new (el: HTMLElement, opts: Record<string, unknown>): TwitchEmbedPlayer
        SEEK: string
        PLAYING: string
        PAUSE: string
      }
    }
  }
}

/** Lets a parent (the split view) read and control the player. */
export interface TwitchPlayerHandle {
  seek: (seconds: number) => void
  getCurrentTime: () => number
  streamStartMs: number | null
}

const EMBED_SRC = 'https://player.twitch.tv/js/embed/v1.js'

/** Seconds to the embed's start-time format, e.g. "1h2m3s". */
function embedTime(seconds: number) {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`
}
const TICK_MS = 1000
const SAVE_EVERY_S = 5

function loadEmbedScript(onReady: () => void, onError: () => void): () => void {
  if (window.Twitch?.Player) {
    onReady()
    return () => {}
  }
  let script = document.querySelector<HTMLScriptElement>(`script[src="${EMBED_SRC}"]`)
  if (!script) {
    script = document.createElement('script')
    script.src = EMBED_SRC
    script.async = true
    document.body.appendChild(script)
  }
  const s = script
  const fail = () => {
    s.remove() // so the next attempt adds a fresh tag instead of waiting forever
    onError()
  }
  s.addEventListener('load', onReady)
  s.addEventListener('error', fail)
  return () => {
    s.removeEventListener('load', onReady)
    s.removeEventListener('error', fail)
  }
}

export function TwitchPlayer({
  ref,
  videoId,
  vodId,
  initialPosition,
  duration,
  streamStartedAt,
  onTime,
  onSync,
}: {
  ref?: Ref<TwitchPlayerHandle>
  videoId: string
  vodId: number
  initialPosition: number
  duration: number
  /** Enables the real-world clock overlay. */
  streamStartedAt: Date | null
  onTime?: (seconds: number) => void
  /** Shows a "sync" button next to the clock (split view). */
  onSync?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<TwitchEmbedPlayer | null>(null)
  const [seconds, setSeconds] = useState(initialPosition)
  const [syncing, setSyncing] = useState(false)
  const [blocked, setBlocked] = useState(false)
  // The clock is shown in the viewer's time zone, which the server doesn't
  // know, so it's only rendered in the browser.
  const hydrated = useHydrated()

  // The embed must be created once per video. If these props fed the effect's
  // dependencies, a background data refresh that changed one of them would
  // rebuild the iframe mid-playback — which looks like a random pause.
  const latest = useRef({ vodId, duration, initialPosition, onTime })
  latest.current = { vodId, duration, initialPosition, onTime }

  const streamStartMs = streamStartedAt ? streamStartedAt.getTime() : null

  useImperativeHandle(
    ref,
    () => ({
      seek: (s) => playerRef.current?.seek(Math.max(0, s)),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      streamStartMs,
    }),
    [streamStartMs],
  )

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    let lastSaved = 0

    const persist = () => {
      const player = playerRef.current
      if (!player) return
      const position = player.getCurrentTime()
      if (position <= 0) return
      void saveProgress({
        data: {
          vodId: latest.current.vodId,
          position,
          duration: player.getDuration() || latest.current.duration,
        },
      })
    }

    setBlocked(false)
    const stopLoading = loadEmbedScript(
      () => {
        const Twitch = window.Twitch
        if (!Twitch || !containerRef.current) return
        const player = new Twitch.Player(containerRef.current, {
          video: videoId,
          // Twitch only allows the embed on the domains listed here.
          parent: [window.location.hostname],
          width: '100%',
          height: '100%',
          autoplay: true,
          // Always pass a start time. Without one the embed resumes from its
          // own memory, which is per browser rather than per Vault user — on a
          // shared computer you'd continue someone else's spot. Twitch treats
          // 0 as "not set", hence at least one second.
          time: embedTime(Math.max(1, latest.current.initialPosition)),
        })
        playerRef.current = player

        // Update the clock immediately on seek/play/pause, not on the next tick.
        const sync = () => setSeconds(player.getCurrentTime())
        player.addEventListener(Twitch.Player.SEEK, sync)
        player.addEventListener(Twitch.Player.PLAYING, sync)
        player.addEventListener(Twitch.Player.PAUSE, sync)

        interval = setInterval(() => {
          const t = player.getCurrentTime()
          if (t <= 0) return
          setSeconds(t)
          latest.current.onTime?.(t)
          if (Math.abs(t - lastSaved) >= SAVE_EVERY_S) {
            lastSaved = t
            persist()
          }
        }, TICK_MS)
      },
      () => setBlocked(true),
    )

    const container = containerRef.current
    return () => {
      stopLoading()
      clearInterval(interval)
      persist() // keep the final position when leaving the page
      playerRef.current = null
      container?.replaceChildren() // drop the old iframe before a new video
    }
  }, [videoId])

  const clock = hydrated ? realClock(streamStartedAt, seconds) : null

  return (
    <div className="group relative size-full bg-black">
      <div ref={containerRef} className="size-full" />
      {blocked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white">
          <p className="font-medium">The Twitch player couldn’t load.</p>
          <p className="max-w-md text-xs text-white/70">
            Your browser blocked player.twitch.tv — usually Firefox’s Enhanced Tracking
            Protection (set to Strict) or a content blocker. Allow it for this site and
            reload the page.
          </p>
        </div>
      ) : null}
      {/* Shown on hover. pointer-events-none so it never blocks the embed. */}
      <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        {clock ? (
          <span className="flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 font-mono text-xs tabular-nums text-white backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-primary" />
            {clock}
          </span>
        ) : null}
        {onSync ? (
          <button
            type="button"
            title="Jump to the same real-world moment as the left stream"
            onClick={() => {
              onSync()
              setSyncing(true)
              setTimeout(() => setSyncing(false), 600)
            }}
            className="pointer-events-auto flex items-center justify-center rounded bg-black/70 p-1 text-white transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
