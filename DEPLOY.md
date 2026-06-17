# Deploying Vault (self-hosted, LAN-only)

Vault runs as one Docker stack: **web** (the app), **worker** (background
polling), **postgres**, **redis**, and **caddy** (HTTPS reverse proxy). It's
reachable only on your local network — nothing is exposed to the internet.

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

## Deploy

On unraid use the **Compose Manager** plugin (paste the repo / compose), or a
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
docker compose -f docker-compose.prod.yml exec web node_modules/.bin/drizzle-kit push --force

# 5. Restart the worker so it polls now (on first boot it starts before step 4
#    and logs one harmless "relation does not exist" error — this clears it)
docker compose -f docker-compose.prod.yml restart worker
```

Open `https://vault.home`, accept the certificate warning, log in with Twitch,
then **Settings → Import follows**. Other household members just visit the same
URL and log in with their own Twitch — each gets their own feed.

### Updating later

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
# if the schema changed:
docker compose -f docker-compose.prod.yml exec web node_modules/.bin/drizzle-kit push --force
```

---

## Access control

- **Default (open signup):** `ALLOWED_TWITCH_USER_IDS` empty — anyone who can
  reach it on your LAN and logs in with Twitch gets their own Vault.
- **Restrict:** set `ALLOWED_TWITCH_USER_IDS=id1,id2,…` to allow only specific
  Twitch accounts.

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
