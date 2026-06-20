/** Substitute Twitch thumbnail %{width}x%{height} placeholders. Returns null
 * for missing or not-yet-processed VODs (Twitch serves a 404/processing
 * placeholder for recently-finished or still-live VODs). */
export function thumbnail(url: string | null, w = 440, h = 248): string | null {
  if (!url || url.includes('_404') || url.includes('processing')) return null
  return url.replace('%{width}', String(w)).replace('%{height}', String(h))
}

/** Deterministic hue (0–359) from a string, for placeholder gradients. */
export function hueFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m > 0 ? `${m}m` : ''}`
  return `${m}m`
}

/** Real-world wall-clock time of a VOD moment = stream start + offset secs. */
export function realClock(
  startedAt: Date | string | null,
  offsetSeconds: number,
): string | null {
  if (!startedAt) return null
  const start = typeof startedAt === 'string' ? new Date(startedAt) : startedAt
  const t = new Date(start.getTime() + offsetSeconds * 1000)
  return t.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Seconds → "1:02:45" / "2:45" (for chapter jump points). */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function timeAgo(date: Date | string | null): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  const days = Math.floor(secs / 86400)
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(secs / 3600)
  if (hours >= 1) return `${hours}h ago`
  const mins = Math.floor(secs / 60)
  return `${mins}m ago`
}
