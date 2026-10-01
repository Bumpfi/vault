import { defineConfig } from 'drizzle-kit'

// DATABASE_URL comes from the environment. The package scripts load
// .env.local via Node's --env-file, which never overrides a variable that is
// already set — so `DATABASE_URL=… pnpm db:studio` targets exactly that
// database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
