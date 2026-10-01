export interface PlaylistParts {
  /** Every file to fetch, in playback order. */
  urls: Array<string>
  container: 'mp4' | 'ts'
}

/**
 * Lists the files that make up an HLS media playlist, in order.
 *
 * Twitch serves fragmented MP4: a small init segment (announced with
 * `#EXT-X-MAP`) holds the codec setup and is followed by media fragments.
 * Init + fragments, concatenated, form one playable .mp4. Older VODs use
 * MPEG-TS segments, which concatenate into a playable .ts on their own.
 */
export function playlistParts(playlist: string, playlistUrl: string): PlaylistParts {
  const urls: Array<string> = []
  let container: PlaylistParts['container'] = 'ts'
  let currentMap: string | null = null

  for (const raw of playlist.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXT-X-MAP:')) {
      container = 'mp4'
      const uri = /URI="([^"]+)"/.exec(line)?.[1]
      // A new init segment only appears after a format change; emit it once.
      if (uri && uri !== currentMap) {
        currentMap = uri
        urls.push(new URL(uri, playlistUrl).href)
      }
    } else if (!line.startsWith('#')) {
      urls.push(new URL(line, playlistUrl).href)
    }
  }
  return { urls, container }
}
