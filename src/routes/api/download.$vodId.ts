import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { auth } from '#/lib/auth'
import { db } from '#/db'
import { vod } from '#/db/schema'
import { findPlaylistUrl } from '#/lib/vod-cdn'

// One-click VOD download: resolve the CDN HLS playlist, then stream all
// MPEG-TS segments concatenated as a single .ts file (raw TS segments are
// concatenable into a playable file — no ffmpeg needed; VLC/mpv play it).

export const Route = createFileRoute('/api/download/$vodId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
        })
        if (!session) return new Response('Unauthorized', { status: 401 })

        const vodId = Number(params.vodId)
        const row = (
          await db
            .select({ title: vod.title })
            .from(vod)
            .where(eq(vod.id, vodId))
            .limit(1)
        )[0]
        if (!row) return new Response('VOD not found', { status: 404 })

        const playlistUrl = await findPlaylistUrl(vodId)
        if (!playlistUrl)
          return new Response(
            'Could not locate this VOD on Twitch’s CDN.',
            { status: 404 },
          )

        const playlist = await fetch(playlistUrl)
        if (!playlist.ok)
          return new Response('Playlist fetch failed', { status: 502 })
        const base = playlistUrl.slice(0, playlistUrl.lastIndexOf('/') + 1)
        const segments = (await playlist.text())
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => new URL(l, base).href)
        if (segments.length === 0)
          return new Response('Empty playlist', { status: 502 })

        // Sequential segment fetch piped straight to the client.
        // ponytail: one segment at a time — LAN + CDN is plenty fast; add
        // prefetch of segment n+1 if downloads feel slow.
        let i = 0
        let currentReader: ReadableStreamDefaultReader<Uint8Array> | null =
          null
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            while (true) {
              if (!currentReader) {
                if (i >= segments.length) {
                  controller.close()
                  return
                }
                const res = await fetch(segments[i++])
                if (!res.ok || !res.body) {
                  controller.error(
                    new Error(`Segment ${i - 1} failed (${res.status})`),
                  )
                  return
                }
                currentReader = res.body.getReader()
              }
              const { done, value } = await currentReader.read()
              if (done) {
                currentReader = null
                continue // next segment
              }
              controller.enqueue(value)
              return
            }
          },
          cancel() {
            void currentReader?.cancel()
          },
        })

        const filename = `${row.title.replace(/[^\w\- ]+/g, '').trim() || `vod-${vodId}`}.ts`
        return new Response(body, {
          headers: {
            'Content-Type': 'video/mp2t',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
