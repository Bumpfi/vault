# Vault — personal Twitch VOD dashboard

Single-user, self-hosted "Netflix for Twitch VODs". Stack: TanStack Start,
Drizzle + Postgres, Better Auth, shadcn/ui + Tailwind, BullMQ + Redis, pnpm.
Worker is a separate entrypoint. Built localhost-first; Tailscale/Docker-prod
is Phase 8.

## Rules

- Single user only; all auth gated on `ALLOWED_TWITCH_USER_ID`.
- Public VOD reads use an app access token (client-credentials); never require
  user scopes for them. Only follows import uses the user token (`user:read:follows`).
- Heavy/scheduled work goes in the worker, never in request handlers.
- Twitch embed `parent` must equal the host (env: `PUBLIC_HOST`; `localhost:3000` in dev).
- Never commit secrets; real values live in `.env.local` (gitignored). `.env.example` is the template.
- pnpm 11 settings live in `pnpm-workspace.yaml`: `verifyDepsBeforeRun: false`
  (works around a pre-run check), `onlyBuiltDependencies` (native build approvals),
  and an `ioredis` override pinned to bullmq's version.
- Env loading: Vite does NOT load `.env*` into server-side `process.env`. Both
  `pnpm dev` and `pnpm worker` load `.env.local` via Node's `--env-file`. Restart
  after editing env. Prod (Phase 8) passes env via Docker.

## Commands

- `pnpm dev`         — web app (port 3000)
- `pnpm worker`      — background jobs
- `pnpm db:push`     — push Drizzle schema to Postgres
- `pnpm db:studio`   — Drizzle Studio
- `docker compose up -d` — local Postgres + Redis

## Twitch endpoints in use

- `GET /helix/users`
- `GET /helix/channels/followed`   (scope: `user:read:follows`)
- `GET /helix/videos?type=archive` (app token)
- `POST https://id.twitch.tv/oauth2/token` (client_credentials + refresh)

## Auth note

Uses Better Auth's first-class `socialProviders.twitch` (not the generic OAuth2
plugin). Callback: `/api/auth/callback/twitch`. The single-user allowlist is a
hand-rolled Better Auth hook comparing `/helix/users` id to `ALLOWED_TWITCH_USER_ID`.
