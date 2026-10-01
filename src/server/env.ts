import { z } from 'zod'

// Parsed once at startup so a missing or malformed variable fails loudly with
// a clear message instead of surfacing later as an obscure runtime error.
const schema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  TWITCH_CLIENT_ID: z.string().min(1),
  TWITCH_CLIENT_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  // Optional comma-separated list of Twitch user ids allowed to sign up.
  ALLOWED_TWITCH_USER_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  throw new Error(`Invalid or missing environment variables: ${fields}`)
}

export const env = parsed.data
