import { describe, expect, it } from 'vitest'
import { formatDuration, formatTimestamp, thumbnail } from './format'
import { parseDuration } from './twitch'

describe('parseDuration', () => {
  it('parses full h/m/s', () => {
    expect(parseDuration('3h20m31s')).toBe(3 * 3600 + 20 * 60 + 31)
  })
  it('parses partial forms', () => {
    expect(parseDuration('45m10s')).toBe(45 * 60 + 10)
    expect(parseDuration('30s')).toBe(30)
    expect(parseDuration('2h')).toBe(7200)
  })
  it('returns 0 for garbage', () => {
    expect(parseDuration('')).toBe(0)
    expect(parseDuration('abc')).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe('3h20m')
    expect(formatDuration(3600)).toBe('1h')
    expect(formatDuration(7 * 60)).toBe('7m')
  })
  it('empty for null/0', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(0)).toBe('')
  })
})

describe('formatTimestamp', () => {
  it('pads and includes hours only when needed', () => {
    expect(formatTimestamp(3725)).toBe('1:02:05')
    expect(formatTimestamp(165)).toBe('2:45')
  })
})

describe('thumbnail', () => {
  it('substitutes size placeholders', () => {
    expect(thumbnail('https://x/%{width}x%{height}.jpg', 440, 248)).toBe(
      'https://x/440x248.jpg',
    )
  })
  it('null for missing/processing thumbs', () => {
    expect(thumbnail(null)).toBeNull()
    expect(thumbnail('https://x/404_processing_440x248.png')).toBeNull()
  })
})
