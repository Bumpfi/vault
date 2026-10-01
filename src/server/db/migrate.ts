// Applies pending SQL migrations from ./drizzle. Runs before the web server
// starts in production, and via `pnpm db:migrate` in development.
// Deliberately standalone (no shared env/db modules) so it only needs
// DATABASE_URL.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL is not set')
  process.exit(1)
}

const db = drizzle(url)

migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? 'drizzle' })
  .then(async () => {
    console.log('[migrate] database is up to date')
    await db.$client.end()
  })
  .catch((err: unknown) => {
    console.error('[migrate] failed:', err)
    process.exit(1)
  })
