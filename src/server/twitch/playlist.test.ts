import { describe, expect, it } from 'vitest'
import { playlistParts } from './playlist'

const BASE = 'https://cdn.example/vod/chunked/index-dvr.m3u8'

describe('playlistParts', () => {
  it('puts the init segment of fragmented MP4 first', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-MAP:URI="init-0.mp4"',
      '#EXTINF:10.000,',
      '0.mp4',
      '#EXTINF:10.000,',
      '1.mp4',
    ].join('\n')

    expect(playlistParts(playlist, BASE)).toEqual({
      container: 'mp4',
      urls: [
        'https://cdn.example/vod/chunked/init-0.mp4',
        'https://cdn.example/vod/chunked/0.mp4',
        'https://cdn.example/vod/chunked/1.mp4',
      ],
    })
  })

  it('handles MPEG-TS playlists without an init segment', () => {
    const playlist = '#EXTM3U\n#EXTINF:10,\n0.ts\n#EXTINF:10,\n1-muted.ts\n'
    expect(playlistParts(playlist, BASE)).toEqual({
      container: 'ts',
      urls: [
        'https://cdn.example/vod/chunked/0.ts',
        'https://cdn.example/vod/chunked/1-muted.ts',
      ],
    })
  })

  it('emits a repeated init segment only when it changes', () => {
    const playlist = [
      '#EXT-X-MAP:URI="init-0.mp4"',
      '0.mp4',
      '#EXT-X-MAP:URI="init-0.mp4"',
      '1.mp4',
      '#EXT-X-DISCONTINUITY',
      '#EXT-X-MAP:URI="init-1.mp4"',
      '2.mp4',
    ].join('\n')

    expect(playlistParts(playlist, BASE).urls.map((u) => u.split('/').pop())).toEqual([
      'init-0.mp4',
      '0.mp4',
      '1.mp4',
      'init-1.mp4',
      '2.mp4',
    ])
  })
})
