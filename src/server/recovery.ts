import { createServerFn } from '@tanstack/react-start'
import { requireUserId } from '#/lib/current-user'
import { findPlaylistUrl } from '#/lib/vod-cdn'

// Best-effort recovery of a deleted VOD. The CDN probing lives in
// lib/vod-cdn.ts (server-only); this file must stay a thin server fn so the
// client bundle never pulls in node:crypto.
export const recoverVod = createServerFn({ method: 'POST' })
  .validator((vodId: number) => vodId)
  .handler(async ({ data: vodId }) => {
    await requireUserId()
    return { url: await findPlaylistUrl(vodId) }
  })
