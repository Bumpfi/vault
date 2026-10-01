import type { ChatComment, ChatPage } from '#/server/twitch/gql'

// Memory bound for the duplicate check on very long VODs. Clearing it can at
// worst let a single duplicate through at a page boundary.
const MAX_TRACKED_IDS = 20_000

/**
 * Queue of chat messages that have been fetched but are not due yet.
 *
 * Pages arrive ahead of playback; `takeUntil(t)` releases whatever is due at
 * playback time `t`. Pages can overlap at their edges, so messages are
 * de-duplicated by id and kept sorted by offset.
 */
export class ChatBuffer {
  cursor: string | null = null
  hasMore = true
  /** Highest message offset fetched so far, in seconds. */
  coveredUntil = -1

  private queue: Array<ChatComment> = []
  private seen = new Set<string>()

  /** Empties the buffer so the next fetch starts at `offset` (a seek). */
  reset(offset: number) {
    this.cursor = null
    this.hasMore = true
    this.coveredUntil = offset - 1
    this.queue = []
    this.seen.clear()
  }

  /** Where the next page should be fetched from. */
  nextPageStart(): { cursor: string } | { offsetSeconds: number } {
    return this.cursor
      ? { cursor: this.cursor }
      : { offsetSeconds: Math.max(0, this.coveredUntil + 1) }
  }

  add(page: ChatPage) {
    this.cursor = page.cursor
    this.hasMore = page.hasMore
    const last = page.comments.at(-1)
    if (last) this.coveredUntil = Math.max(this.coveredUntil, last.offset)

    if (this.seen.size > MAX_TRACKED_IDS) this.seen.clear()
    const fresh = page.comments.filter((c) => !this.seen.has(c.id))
    if (fresh.length === 0) return
    for (const c of fresh) this.seen.add(c.id)
    this.queue.push(...fresh)
    this.queue.sort((a, b) => a.offset - b.offset)
  }

  /** Removes and returns every queued message at or before `time`. */
  takeUntil(time: number): Array<ChatComment> {
    let n = 0
    while (n < this.queue.length && this.queue[n].offset <= time) n++
    return n === 0 ? [] : this.queue.splice(0, n)
  }

  /** True while there are pages left and `time + lookahead` isn't covered. */
  needsMore(time: number, lookahead: number): boolean {
    return this.hasMore && this.coveredUntil < time + lookahead
  }
}
