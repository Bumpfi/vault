# Vault

A self-hosted, multi-user **"Netflix for Twitch VODs"** — track the streamers
you follow, browse their past broadcasts, and watch them with resume, watched
state, synced chat replay, split-view, and a real-world clock. Runs entirely on
your own hardware; private to your LAN.

**Website:** [vault.felixkargl.dev](https://vault.felixkargl.dev)

---

## Motivation

Twitch VODs are scattered, hard to keep up with, and disappear after a few
weeks. There's no good way to see *new* VODs across all the streamers you
follow, track what you've already watched, or resume where you left off — and
once a VOD is deleted, it's gone.

Vault is a personal dashboard that fixes that. It's a discovery and viewing
layer on top of Twitch (not an archive): it polls the streamers you subscribe
to, surfaces their VODs in one feed, and remembers your progress — like a
private Netflix for your Twitch follows.

**Features**

- **Personal feed** — VODs from your subscribed streamers, with watched badges,
  resume progress bars, live indicators, and "age" stamps.
- **Multi-user** — everyone logs in with their own Twitch account and gets their
  own follows, watched state, and progress (shared streamer/VOD catalog). The
  first user becomes **admin** and controls registration + users in-app.
- **Player & theater mode** — embedded Twitch player with resume,
  auto-mark-watched at 90%, a continue-watching row, and a layout that fills
  the screen without fullscreen.
- **Real-world clock** — overlay showing the actual time of day a moment aired.
- **Synced chat replay** — original stream chat scrolls in time with playback.
- **Game chapters** — jump to each game played during a stream.
- **Split view** — two players side by side, with one-click sync to the same
  real-world moment (great for multi-POV roleplay).
- **One-click download** — save a VOD to your computer as a single playable
  `.ts` file, streamed straight from Twitch's CDN.
- **Deleted detection + best-effort recovery** — deleted VODs are flagged, and
  recently-deleted ones can often still be played back.
- **Categories + filters**, **mark-older-watched**, **dark & light themes**
  saved per account.

**Tech stack:** TanStack Start (React, SSR) · PostgreSQL + Drizzle ORM ·
Better Auth (Twitch OAuth) · shadcn/ui + Tailwind v4 · BullMQ + Redis · pnpm ·
Docker + Caddy.

---

## Quick Start

Run Vault on a home server (e.g. unraid), reachable over your LAN. Twitch OAuth
requires HTTPS off-localhost, so a bundled Caddy proxy serves it over HTTPS.

**You need:** Docker + Docker Compose, a
[Twitch application](https://dev.twitch.tv/console) (Client ID + Secret), and a
hostname for the box (e.g. `vault.home`).

```bash
git clone https://github.com/Bumpfi/vault.git && cd vault
cp .env.production.example .env      # fill Twitch creds, a secret, your host
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml exec web node_modules/.bin/drizzle-kit push --force --config drizzle.config.ts
docker compose -f docker-compose.prod.yml restart worker
```

Open `https://<your-host>`, accept the self-signed certificate, and sign in with
Twitch. Full step-by-step (hostname/DNS, Twitch redirect URL, updates,
troubleshooting) is in **[DEPLOY.md](DEPLOY.md)**.

---

## Usage

1. **Sign in** with Twitch — the first account becomes the **admin**, who can
   enable/disable registration for further users and manage them in
   **Settings → Administration**. (An optional `ALLOWED_TWITCH_USER_IDS`
   allowlist additionally restricts signups.) The login page has a built-in
   setup guide with your exact OAuth callback URL.
2. **Settings → Import follows** to pull in the channels you follow, then toggle
   subscriptions and assign categories ("RP", "Variety", …).
3. **Browse the feed** — filter by category, streamer, or "unwatched only";
   pick up where you left off in the continue-watching row.
4. **Watch** — resume, auto-watched at 90%, synced chat replay, real-world
   clock, and game-chapter jump points.
5. **Split view** — open a VOD → *Split view* → pick a second one → *sync* both
   to the same real-world moment.
6. **Download** — on any VOD's watch page, *Download* saves it to your machine
   as a single `.ts` file (plays in VLC/mpv).

VOD polling (every 15 min) and availability checks run automatically in the
background worker.

---

## 🤝 Contributing

Contributions welcome. To run Vault locally for development:

### Clone the repo

```bash
git clone https://github.com/Bumpfi/vault.git
cd vault
```

### Install dependencies & start infra

```bash
pnpm install
docker compose up -d        # local Postgres + Redis
```

### Configure environment

```bash
cp .env.example .env.local
# fill TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET, and generate a secret:
#   openssl rand -base64 32   ->   BETTER_AUTH_SECRET
```

Register `http://localhost:3000/api/auth/callback/twitch` as an OAuth Redirect
URL in your Twitch app.

### Create the schema & run

```bash
pnpm db:push
pnpm dev        # web app on http://localhost:3000
pnpm worker     # background jobs (second terminal)
```

### Run checks

```bash
pnpm test       # vitest
pnpm lint       # eslint
```

### Submit a pull request

If you'd like to contribute, please fork the repository and open a pull request
against the `main` branch.

---

## Known limitations

- Chat replay, game chapters, deleted-VOD recovery, and downloads use Twitch's
  **unofficial** endpoints/CDN paths — undocumented and may break if Twitch
  changes them (the app degrades gracefully).
- Deleted VODs are only recoverable for a short window while their segments
  remain on Twitch's CDN; recovered VODs play in a basic HLS player without chat.

## Legal

Vault is an independent project, **not affiliated with or endorsed by Twitch**.
It uses the official Twitch API where possible; some features (chat replay,
recovery, downloads) rely on unofficial endpoints and may conflict with
Twitch's Terms of Service — use them at your own discretion, for personal use.
Downloaded VODs are the copyright of their creators/Twitch: keep them private,
don't re-upload or redistribute.

## License

[MIT](LICENSE)
