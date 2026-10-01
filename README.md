# Vault

A self-hosted, multi-user dashboard for Twitch VODs. It tracks the channels you
follow, collects their past broadcasts in one feed, and lets you watch them with
resume, watched state, synced chat replay and a split view for watching two
perspectives side by side.

**Website:** [vault.felixkargl.dev](https://vault.felixkargl.dev)

---

## Motivation

Twitch VODs are hard to keep up with. There's no single place that shows the
new VODs of everyone you follow, nothing remembers what you've already watched
or where you stopped, and VODs disappear after a few weeks.

Vault is a viewing layer on top of Twitch. A background worker polls the
channels in your library, new VODs land in one feed, and your progress is saved
per account. It runs on your own hardware, and everyone in your household can
sign in with their own Twitch account.

### Features

- **Feed** of VODs from the channels in your library, with progress bars,
  watched badges, a live marker on the VOD that is still being recorded, search,
  and filters by category, channel and unwatched.
- **Resume and watched state** per user. A VOD counts as watched at 90 %, and a
  "continue watching" row lists what you started.
- **Chat replay** next to the player, in sync with playback, with badges
  (moderator, VIP, subscriber, …) and emotes.
- **Real-world clock** showing the time of day a moment originally aired.
- **Game chapters** to jump to each game played in a stream.
- **Split view**: two VODs side by side, synced to the same real-world moment.
- **Download** a VOD as a single video file.
- **Deleted VODs** are flagged, and recently deleted ones can often still be
  played back.
- **Multi-user**: the first account becomes admin and controls whether others
  can register.
- Five themes (Noir, Cream, Dracula, Catppuccin, Rain).

**Stack:** TanStack Start (React, SSR) · PostgreSQL + Drizzle · Better Auth
(Twitch OAuth) · BullMQ + Redis · Tailwind CSS · Docker

---

## Quick Start

You need Docker and a free [Twitch application](https://dev.twitch.tv/console/apps)
(category "Website Integration"). Its OAuth redirect URL must be
`<your Vault URL>/api/auth/callback/twitch`; the login page shows the exact
value.

### Home server or LAN

Uses `docker-compose.prod.yml`, which includes Caddy for HTTPS. Twitch only
redirects to https addresses (localhost aside), and Caddy creates its own
certificate for a private hostname like `vault.home`.

```bash
git clone https://github.com/Bumpfi/vault.git && cd vault
cp .env.production.example .env    # fill in the values
docker compose -f docker-compose.prod.yml up -d --build
```

Open your URL, accept the certificate warning once per device, and sign in.
The database schema is created automatically on startup.

### Behind an existing reverse proxy (Coolify, Traefik, …)

Use `docker-compose.coolify.yml`, which has no bundled proxy, and point your
proxy at the `web` service on port 3000.

[DEPLOY.md](DEPLOY.md) has the step-by-step guide for both setups, plus
updating, backups and troubleshooting.

---

## Usage

1. **Sign in** with Twitch. The first account becomes the admin and can open
   or close registration under **Settings → Administration**.
2. **Settings → Import my follows** adds the channels you follow on Twitch.
   Switch off the ones you don't want in your feed, and give channels a
   category such as "RP" or "Variety".
3. **Browse the feed.** New VODs arrive every 15 minutes, or immediately with
   _Refresh VODs_.
4. **Watch.** Playback resumes where you stopped; chat replay and chapters
   are next to and below the player.
5. **Split view** on the watch page opens a second VOD next to the first; the
   sync button jumps it to the same real-world moment.

---

## Project structure

```
src/
  routes/              pages and HTTP endpoints (file-based routing)
    _authed/           pages that require a signed-in user
    api/               auth handler, VOD download, health check
  features/            one folder per feature: server functions + UI
    auth/  feed/  watch/  chat/  streamers/  settings/  admin/
  server/              server-only code; never shipped to the browser
    db/                schema, connection, migration runner
    twitch/            Twitch API clients (official, GraphQL, CDN)
    jobs/              VOD polling and availability checks
  components/          shared UI
  lib/                 small helpers used on both sides
worker/                background job runner (separate process)
drizzle/               SQL migrations
```


---

## Contributing

To run Vault locally:

```bash
git clone https://github.com/Bumpfi/vault.git && cd vault
pnpm install
docker compose up -d              # Postgres and Redis
cp .env.example .env.local        # add your Twitch app and a secret
pnpm db:migrate
pnpm dev                          # http://localhost:3000
pnpm worker                       # background jobs, in a second terminal
```

Add `http://localhost:3000/api/auth/callback/twitch` as a redirect URL in your
Twitch app.

Before opening a pull request:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Schema changes: edit `src/server/db/schema.ts`, run `pnpm db:generate` to create
a migration in `drizzle/`, and commit it. Migrations run automatically when the
app starts.

---

## Known limitations

- Chat replay, chapters, downloads and deleted-VOD recovery rely on Twitch's
  undocumented internal APIs, which can change without notice. When they break,
  the rest of the app keeps working.
- Deleted VODs can only be recovered while Twitch still has the video files,
  usually a short time after deletion.

## Legal

Vault is not affiliated with or endorsed by Twitch. It uses Twitch's official
API where one exists. Chat replay, recovery and downloads use unofficial
endpoints and may conflict with Twitch's Terms of Service, so use them for
personal purposes only. Downloaded VODs belong to their creators: keep them
private and don't redistribute them.

## License

[MIT](LICENSE)
