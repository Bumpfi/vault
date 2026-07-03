# Deploying Vault

Vault runs as one Docker stack: **web** (the app), **worker** (background
polling), **postgres**, and **redis**.

## Choose your path

| Where | Compose file | HTTPS by | Guide |
|---|---|---|---|
| **Home server / LAN** (unraid, NAS, spare box) | `docker-compose.prod.yml` | bundled **Caddy**, self-signed cert | [below](#deploy-home-server--lan) |
| **Public VPS with Coolify** | `docker-compose.coolify.yml` | Coolify's proxy, real Let's Encrypt cert | [below](#deploying-with-coolify-public-vps) |
| **Local development** | none — `pnpm dev` | not needed (Twitch allows `http://localhost`) | [README → Contributing](README.md#-contributing) |

Other reverse proxies (Traefik, Nginx Proxy Manager, plain nginx): use
`docker-compose.coolify.yml` as the base — no bundled proxy — and point yours
at the `web` service on port `3000`; provide the same env vars through your
tooling.

## Why HTTPS (and a cert warning)

Twitch's OAuth **requires `https`** for any redirect URL that isn't
`http://localhost`. So to log in from another device on your LAN, the app must
be served over HTTPS. Caddy generates a **self-signed certificate**, so the
first time you visit you'll see a browser "not secure" warning — click through
once per device (or install Caddy's root CA to remove it, see bottom).

## What you need to change vs. local dev

Only environment + how it's run. No code changes.

| | Local dev | Production (unraid) |
|---|---|---|
| Run | `pnpm dev` + `pnpm worker` | `docker compose -f docker-compose.prod.yml up -d` |
| Env | `.env.local` | `.env` |
| DB/Redis host | `localhost` | `postgres` / `redis` (compose names) |
| URL | `http://localhost:3000` | `https://vault.home` (via Caddy) |

---

## One-time prerequisites

1. **Pick a host** for the app. A hostname is recommended (Twitch may reject a
   bare IP). E.g. `vault.home`. Make it resolve to your unraid box's LAN IP on
   the devices you'll use — easiest options:
   - Add an entry in your router / Pi-hole DNS, **or**
   - Add `192.168.x.x  vault.home` to each device's hosts file.
   (You *can* try your raw unraid IP instead; if Twitch rejects it when saving
   the redirect URL, use a hostname.)
2. **Twitch app** (https://dev.twitch.tv/console): copy Client ID/Secret and add
   the **OAuth Redirect URL** exactly: `https://vault.home/api/auth/callback/twitch`
   (keep `http://localhost:3000/api/auth/callback/twitch` too, for dev).

---

## Deploy (home server / LAN)

Reachable only on your local network — nothing exposed to the internet. On
unraid use the **Compose Manager** plugin (paste the repo / compose), or a
terminal:

```bash
# 1. Get the code
git clone <your-repo> vault && cd vault

# 2. Configure env
cp .env.production.example .env
#   edit .env: Twitch creds, BETTER_AUTH_SECRET (openssl rand -base64 32),
#   and set the SAME host in SITE_ADDRESS / BETTER_AUTH_URL / PUBLIC_HOST /
#   OAUTH_REDIRECT_URL (e.g. vault.home).

# 3. Build + start everything
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# 4. Create the database schema (one time, first deploy only)
docker compose -f docker-compose.prod.yml exec web node_modules/.bin/drizzle-kit push --force --config drizzle.config.ts

# 5. Restart the worker so it polls now (on first boot it starts before step 4
#    and logs one harmless "relation does not exist" error — this clears it)
docker compose -f docker-compose.prod.yml restart worker
```

Open `https://vault.home`, accept the certificate warning, log in with Twitch,
then **Settings → Import follows**. Other household members just visit the same
URL and log in with their own Twitch — each gets their own feed.

### Deploying with Coolify (public VPS)

Use **`docker-compose.coolify.yml`** instead — it drops the bundled Caddy
(Coolify's own proxy terminates HTTPS with a real certificate) and reads env
from Coolify instead of a `.env` file:

1. Project → **+ New → Git repository**, pick the repo, Build Pack **Docker Compose**.
2. **Build → Docker Compose Location**: `/docker-compose.coolify.yml`, then *Reload Compose File*.
3. **Domains**: on the **web** service only, with the container port appended:
   `https://app.yourdomain.com:3000` (the `:3000` tells Coolify's proxy which
   container port to forward to — visitors still use normal 443). Leave
   worker/postgres/redis without domains — the worker has no HTTP server.
4. **Environment Variables**: set everything listed at the top of `docker-compose.coolify.yml` (Twitch creds, `BETTER_AUTH_SECRET`, `DATABASE_URL` with the postgres password, URLs pointing at your domain).
5. Add `https://app.yourdomain.com/api/auth/callback/twitch` as an OAuth redirect in the Twitch console.
6. Deploy. Then create the schema once via the **web** container's terminal in Coolify:
   `node_modules/.bin/drizzle-kit push --force --config drizzle.config.ts` and restart the worker.
7. **Sign in immediately** — the first account becomes admin — and since the instance is public, consider turning **Open registration off** in Settings → Administration (or set `ALLOWED_TWITCH_USER_IDS`).

**502 Bad Gateway checklist:** web container logs show a crash (missing env
var)? Domain missing the `:3000` port suffix? Compose Location still pointing
at `docker-compose.prod.yml` (its bundled Caddy conflicts with Coolify's
proxy)? Build still running/failed in the Deployments tab?

### Updating later

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
# if the schema changed:
docker compose -f docker-compose.prod.yml exec web node_modules/.bin/drizzle-kit push --force --config drizzle.config.ts
```

---

## Access control

- **First user = admin.** The first Twitch account to sign in becomes the
  admin and can manage users and toggle registration in **Settings →
  Administration**.
- **Registration toggle (in-app):** admins can turn "Open registration" off to
  block any new signups. Existing users always keep access.
- **Optional env allowlist:** set `ALLOWED_TWITCH_USER_IDS=id1,id2,…` to
  additionally restrict signups to specific Twitch accounts. Empty = no
  allowlist.

---

## Notes & troubleshooting

- **Cert warning:** expected (self-signed). To remove it, copy Caddy's root CA
  from the `caddydata` volume
  (`/data/caddy/pki/authorities/local/root.crt`) and install/trust it on your
  devices.
- **Embed:** the player's `parent` is derived from the browser host
  automatically, so it matches your chosen host with no extra config.
- **Worker logs:** `docker compose -f docker-compose.prod.yml logs -f worker`.
- **Backups:** all state is in the `pgdata` volume — back that up.
- **`redirect_mismatch` on login:** the URL in the Twitch console must match
  `OAUTH_REDIRECT_URL` exactly (scheme, host, path).
