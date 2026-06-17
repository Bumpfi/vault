# Vault — personal Twitch VOD dashboard

Self-hosted, multi-user "Netflix for Twitch VODs". Stack: TanStack Start,
Drizzle + Postgres, Better Auth, shadcn/ui + Tailwind, BullMQ + Redis, pnpm.
Worker is a separate entrypoint. Built localhost-first; Tailscale/Docker-prod
is Phase 8.

## Rules

- Multi-user. `ALLOWED_TWITCH_USER_IDS` (comma list) gates login: empty = open
  signup (anyone gets their own Vault); set = only those Twitch ids allowed.
- Per-user data: `subscription` (follows) + `watch_progress` (userId, watched,
  resume). `streamer`/`vod` are a shared catalog. Always scope queries by the
  session user id (`requireUserId()` inside server-fn handlers).
- DEPRECATED columns kept to avoid a destructive migration: `streamer.subscribed`,
  `vod.watched`. Unused — drop in a later cleanup.
- Public VOD reads use an app access token (client-credentials); never require
  user scopes for them. Only follows import uses the user token (`user:read:follows`).
- Heavy/scheduled work goes in the worker, never in request handlers.
- Twitch embed `parent` must equal the host (env: `PUBLIC_HOST`; `localhost:3000` in dev).
- Never commit secrets; real values live in `.env.local` (gitignored). `.env.example` is the template.
- pnpm 11 settings live in `pnpm-workspace.yaml` (not duplicated in package.json):
  `verifyDepsBeforeRun: false` (pre-run check), `strictDepBuilds: false` (so an
  ignored optional build script can't fail a fresh Docker install),
  `onlyBuiltDependencies` (native build approvals), `allowBuilds` (explicit
  skip for `@parcel/watcher`), and an `ioredis` override pinned to bullmq's version.
- Production deploy: `Dockerfile` + `docker-compose.prod.yml` (web/worker/postgres/
  redis/caddy). LAN-only; Caddy serves HTTPS with a self-signed cert because Twitch
  OAuth requires https off-localhost. `pnpm build` emits a Nitro Node server at
  `.output/server/index.mjs` (`pnpm start`). See `DEPLOY.md`.
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
plugin). Callback: `/api/auth/callback/twitch`. The allowlist gate is hand-rolled
in `mapProfileToUser` (in `lib/auth.ts`), comparing the Twitch id (`profile.sub`)
to `ALLOWED_TWITCH_USER_IDS`; an empty list allows anyone.
