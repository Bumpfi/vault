/**
 * Fills Twitch's `%{width}x%{height}` thumbnail template. Returns null for
 * VODs Twitch hasn't generated a thumbnail for yet (live or processing).
 */
export function thumbnail(url: string | null, w = 440, h = 248): string | null {
  if (!url || url.includes('_404') || url.includes('processing')) return null
  return url.replace('%{width}', String(w)).replace('%{height}', String(h))
}

/** Stable hue (0–359) derived from a string, for placeholder colors. */
export function hueFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

/** Twitch duration strings ("3h20m31s", "45m10s", "30s") to seconds. */
export function parseDuration(duration: string): number {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(duration)
  if (!m) return 0
  const [, h = 0, min = 0, s = 0] = m
  return Number(h) * 3600 + Number(min) * 60 + Number(s)
}

/** Seconds to a compact length like "3h20m" or "7m". */
export function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`
  return `${m}m`
}

/** Seconds to a player-style position like "1:02:45" or "2:45". */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Wall-clock time at which a moment of a VOD aired: stream start + offset. */
export function realClock(
  startedAt: Date | string | null,
  offsetSeconds: number,
): string | null {
  if (!startedAt) return null
  const t = new Date(new Date(startedAt).getTime() + offsetSeconds * 1000)
  return t.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function timeAgo(date: Date | string | null): string {
  if (!date) return ''
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs >= 86400) return `${Math.floor(secs / 86400)}d ago`
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.max(0, Math.floor(secs / 60))}m ago`
}
