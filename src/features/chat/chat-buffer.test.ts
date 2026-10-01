import { describe, expect, it } from 'vitest'
import { ChatBuffer } from './chat-buffer'
import type { ChatComment } from '#/server/twitch/gql'

const msg = (id: string, offset: number): ChatComment => ({
  id,
  offset,
  name: 'viewer',
  color: null,
  badges: [],
  fragments: [{ text: 'hi' }],
})

const page = (comments: Array<ChatComment>, cursor: string | null = 'c1') => ({
  comments,
  cursor,
  hasMore: cursor !== null,
})

describe('ChatBuffer', () => {
  it('releases only messages that are due, in order', () => {
    const buf = new ChatBuffer()
    buf.add(page([msg('a', 1), msg('b', 2), msg('c', 5)]))

    expect(buf.takeUntil(2).map((m) => m.id)).toEqual(['a', 'b'])
    expect(buf.takeUntil(4)).toEqual([])
    expect(buf.takeUntil(5).map((m) => m.id)).toEqual(['c'])
  })

  it('drops duplicates from overlapping pages', () => {
    const buf = new ChatBuffer()
    buf.add(page([msg('a', 1), msg('b', 2)]))
    buf.add(page([msg('b', 2), msg('c', 3)]))

    expect(buf.takeUntil(10).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps messages sorted when pages arrive out of order', () => {
    const buf = new ChatBuffer()
    buf.add(page([msg('late', 9)]))
    buf.add(page([msg('early', 3)]))

    expect(buf.takeUntil(10).map((m) => m.id)).toEqual(['early', 'late'])
  })

  it('asks for more until the lookahead window is covered', () => {
    const buf = new ChatBuffer()
    expect(buf.needsMore(0, 60)).toBe(true)

    buf.add(page([msg('a', 30)]))
    expect(buf.needsMore(0, 60)).toBe(true) // covered to 30 < 60

    buf.add(page([msg('b', 61)]))
    expect(buf.needsMore(0, 60)).toBe(false)
  })

  it('stops asking once the last page arrived', () => {
    const buf = new ChatBuffer()
    buf.add(page([msg('a', 1)], null))
    expect(buf.needsMore(0, 60)).toBe(false)
  })

  it('pages by cursor, and by offset after a seek', () => {
    const buf = new ChatBuffer()
    expect(buf.nextPageStart()).toEqual({ offsetSeconds: 0 })

    buf.add(page([msg('a', 1)], 'next'))
    expect(buf.nextPageStart()).toEqual({ cursor: 'next' })

    buf.reset(600)
    expect(buf.nextPageStart()).toEqual({ offsetSeconds: 600 })
    expect(buf.takeUntil(10_000)).toEqual([])
  })
})
