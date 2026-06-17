import { useEffect, useRef } from 'react'
import { saveProgress } from '#/server/progress'

declare global {
  interface Window {
    Twitch?: {
      Player: {
        new (
          el: HTMLElement | string,
          opts: Record<string, unknown>,
        ): TwitchPlayerInstance
        READY: string
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

const EMBED_SRC = 'https://player.twitch.tv/js/embed/v1.js'
const TICK_MS = 1000
const SAVE_DELTA_S = 5

export function TwitchPlayer({
  videoId,
  vodId,
  initialPosition,
  duration,
  onTime,
}: {
  videoId: string
  vodId: number
  initialPosition: number
  duration: number
  onTime?: (seconds: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<TwitchPlayerInstance | null>(null)
  const lastSaved = useRef(0)
  // Keep the latest onTime without re-running the player effect.
  const onTimeRef = useRef(onTime)
  onTimeRef.current = onTime

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
      interval = setInterval(() => {
        const t = player.getCurrentTime()
        if (t <= 0) return
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

  return <div ref={containerRef} className="size-full" />
}
