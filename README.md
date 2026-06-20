# Vault

A self-hosted, multi-user **"Netflix for Twitch VODs"** — track the streamers
you follow, browse their past broadcasts, and watch them with resume, watched
state, synced chat replay, split-view, and a real-world clock. Runs entirely on
your own hardware; private to your LAN.

> Vault is a discovery and viewing layer on top of Twitch — not an archive.
> When Twitch deletes a VOD it's gone from the source; Vault flags it (and can
> attempt a best-effort recovery while the file lingers on Twitch's CDN).

---

## Features

- **Personal feed** — a grid of VODs from the streamers you subscribe to, with
  watched badges, resume progress bars, and "age" stamps.
- **Multi-user** — each person logs in with their own Twitch account and gets
  their own follows, watched state, and resume positions. A shared streamer/VOD
  catalog under the hood.
- **Player** — embedded Twitch player with resume, auto-mark-watched at 90%, and
  a **continue-watching** row.
- **Real-world clock** — overlay showing the actual time of day a moment was
  originally streamed.
- **Synced chat replay** — the original stream chat scrolls in time with
  playback (seek-aware), with emotes.
- **Game chapters** — jump to each game played during a stream.
- **Split view** — two players side by side (e.g. different POVs of the same
  event) with a one-click "sync to the other stream's real-world time".
- **Live indicator** — a pulsing tag on streamers who are live right now.
- **Categories** — tag streamers ("RP", "Variety", …) and filter the feed by
  category; set a default category + default "unwatched only".
- **Mark older watched** — clear a backlog in one click.
- **Deleted detection + recovery** — flags VODs Twitch has removed, and offers a
  best-effort recovery for recently-deleted ones.

---

## Tech stack

- **[TanStack Start](https://tanstack.com/start)** (React, SSR, server functions)
- **PostgreSQL** + **[Drizzle ORM](https://orm.drizzle.team)**
- **[Better Auth](https://better-auth.com)** (Twitch OAuth)
- **[shadcn/ui](https://ui.shadcn.com)** + **Tailwind CSS v4**
- **[BullMQ](https://docs.bullmq.io)** + **Redis** (background jobs in a separate
  worker process)
- **pnpm**, Node 20+
- Production: **Docker Compose** + **Caddy** (HTTPS on the LAN)

---

## Self-hosting (quick start)

Vault is designed to run on a home server (e.g. unraid) and be reached over your
LAN. Twitch OAuth requires HTTPS off-localhost, so a Caddy reverse proxy serves
the app over HTTPS with a self-signed certificate.

**You need:** Docker + Docker Compose, a [Twitch application](https://dev.twitch.tv/console)
(Client ID + Secret), and a hostname for the box (e.g. `vault.home`).

```bash
git clone <your-fork-url> vault && cd vault
cp .env.production.example .env      # fill in Twitch creds, a secret, your host
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml exec web node_modules/.bin/drizzle-kit push --force
docker compose -f docker-compose.prod.yml restart worker
```

Open `https://<your-host>`, accept the certificate warning, and sign in with
Twitch. **Full step-by-step (hostname/DNS, Twitch redirect URL, updates,
troubleshooting) is in [DEPLOY.md](DEPLOY.md).**

**Access control:** set `ALLOWED_TWITCH_USER_IDS` (comma-separated Twitch ids) to
restrict who can sign in, or leave it empty for open signup (fine on a private
LAN).

### Updating a running server

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
# only if the schema changed:
docker compose -f docker-compose.prod.yml exec web node_modules/.bin/drizzle-kit push --force
docker compose -f docker-compose.prod.yml restart worker
```

Your data lives in the `pgdata` Docker volume and survives updates.

---

## Local development

**Prerequisites:** Node 20+, pnpm 11, Docker (for Postgres + Redis).

```bash
# 1. Install
pnpm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Configure env
cp .env.example .env.local
#    fill TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET, generate a secret:
#    openssl rand -base64 32  ->  BETTER_AUTH_SECRET
#    (leave ALLOWED_TWITCH_USER_IDS empty for open signup)

# 4. Create the schema
pnpm db:push

# 5. Run the app and the worker (two terminals)
pnpm dev        # web app on http://localhost:3000
pnpm worker     # background jobs (VOD polling, availability checks)
```

Register `http://localhost:3000/api/auth/callback/twitch` as an OAuth Redirect
URL in your Twitch app, then open <http://localhost:3000>.

> Env files are loaded into the server via Node's `--env-file` (Vite doesn't put
> `.env*` into server-side `process.env`). Restart `pnpm dev` after editing env.

### Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Web app (port 3000) |
| `pnpm worker` | Background job worker |
| `pnpm db:push` | Push the Drizzle schema to Postgres |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm build` | Production build (Nitro Node server in `.output/`) |
| `pnpm start` | Run the production build |

---

## Project structure

```
src/
  routes/          File-based routes (feed, watch, split, settings, login, auth)
  server/          Server functions (data layer): vods, streamers, progress,
                   settings, chat, recovery — each scoped to the session user
  lib/             auth, Twitch Helix client, poll/availability logic, helpers
  components/      Player, chat replay, VOD card, header, shadcn/ui primitives
  db/              Drizzle schema + client
worker/            BullMQ worker entrypoint + scheduled jobs
docker-compose.yml          Local dev infra (Postgres + Redis)
docker-compose.prod.yml     Production stack (web, worker, postgres, redis, caddy)
```

**Architecture:** the web app keeps the request path fast; all heavy/scheduled
work (polling Twitch for new VODs every 15 min, availability checks every 6 h,
token refresh) runs in the separate `worker` process. Both share the Drizzle
schema. Public VOD reads use a Twitch **app access token**; only importing your
follows uses your **user token** (`user:read:follows` scope).

---

## How data is fetched

- **Official Twitch Helix API** — users, followed channels, archive VODs, live
  status. This is the reliable baseline.
- **Unofficial endpoints** (best-effort, personal-use): chat replay and game
  chapters come from Twitch's private GraphQL (the same source community tools
  use); deleted-VOD recovery reconstructs the CDN playlist URL. These are
  undocumented and can break if Twitch changes them — the app degrades
  gracefully (e.g. "chat unavailable") rather than erroring.

## Known limitations

- **Chat / chapters / recovery** rely on unofficial endpoints (above).
- **Deleted VODs** are only recoverable for a short window while their segments
  remain on Twitch's CDN; recovered VODs play in a basic HLS player with no chat.
- **Expiry timing** (if enabled) is an estimate — Twitch doesn't expose exact
  retention via the API.

---

## License

Personal project — use at your own discretion and within Twitch's Terms of
Service.
