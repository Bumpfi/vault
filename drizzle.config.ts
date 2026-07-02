import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit auto-loads .env on its own before this runs, so a plain load
// can't win (var already set). override: last file listed wins → .env.local.
config({ path: ['.env', '.env.local'], override: true })

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
