import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { auth } from '#/server/auth'
import { db } from '#/server/db'
import { vod } from '#/server/db/schema'
import { findPlaylistUrl } from '#/server/twitch/cdn'
import { playlistParts } from '#/server/twitch/playlist'

// Streams a whole VOD as a single file. HLS video is split into segments
// that can simply be concatenated into one playable file (see
// playlistParts), so this is a pass-through: nothing is buffered or
// re-encoded.
export const Route = createFileRoute('/api/download/$vodId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session) return new Response('Unauthorized', { status: 401 })

        const vodId = Number(params.vodId)
        if (!Number.isInteger(vodId) || vodId <= 0) {
          return new Response('Invalid VOD id', { status: 400 })
        }
        const [row] = await db
          .select({ title: vod.title })
          .from(vod)
          .where(eq(vod.id, vodId))
          .limit(1)
        if (!row) return new Response('VOD not found', { status: 404 })

        const playlistUrl = await findPlaylistUrl(vodId)
        if (!playlistUrl) {
          return new Response('Could not locate this VOD on Twitch’s CDN.', {
            status: 404,
          })
        }
        const playlist = await fetch(playlistUrl)
        if (!playlist.ok) return new Response('Playlist fetch failed', { status: 502 })
        const { urls, container } = playlistParts(await playlist.text(), playlistUrl)
        if (urls.length === 0) return new Response('Empty playlist', { status: 502 })

        const filename = row.title.replace(/[^\w\- ]+/g, '').trim() || `vod-${vodId}`
        return new Response(concatSegments(urls, request.signal), {
          headers: {
            'Content-Type': container === 'mp4' ? 'video/mp4' : 'video/mp2t',
            'Content-Disposition': `attachment; filename="${filename}.${container}"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})

/**
 * Fetches segments one after another and pipes them into a single stream.
 * Pull-based, so a slow client automatically slows the download down, and
 * closing the tab (abort signal) stops it.
 */
function concatSegments(urls: Array<string>, signal: AbortSignal) {
  const pending = urls[Symbol.iterator]()
  let current: ReadableStreamDefaultReader<Uint8Array> | null = null

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (!current) {
          const next = pending.next()
          if (next.done) {
            controller.close()
            return
          }
          const res = await fetch(next.value, { signal })
          if (!res.ok || !res.body) {
            controller.error(new Error(`Segment failed: ${res.status}`))
            return
          }
          current = res.body.getReader()
        }
        const { done, value } = await current.read()
        if (!done) {
          controller.enqueue(value)
          return
        }
        current = null // segment finished; continue with the next one
      }
    },
    cancel() {
      void current?.cancel()
    },
  })
}
