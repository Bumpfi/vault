import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { db } from '#/server/db'

// Container healthcheck: healthy once the server is up and can reach the
// database. The worker waits for this before it starts.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.execute(sql`select 1`)
          return Response.json({ ok: true })
        } catch {
          return Response.json({ ok: false }, { status: 503 })
        }
      },
    },
  },
})
