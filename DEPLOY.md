# Deploying Vault

Vault runs as four containers: **web** (the app), **worker** (background
jobs), **postgres** and **redis**. Pick a setup:

| Where                                                                    | Compose file                 | HTTPS                                  |
| ------------------------------------------------------------------------ | ---------------------------- | -------------------------------------- |
| Home server or LAN (unraid, NAS, …)                                      | `docker-compose.prod.yml`    | bundled Caddy with its own certificate |
| Behind an existing reverse proxy (Coolify, Traefik, Nginx Proxy Manager) | `docker-compose.coolify.yml` | your proxy                             |

Both read the same variables, documented in `.env.production.example`.

## How startup works

1. Postgres and Redis start and report healthy.
2. `web` applies any pending database migrations, then starts the server. It
   reports healthy once it can reach the database (`/api/health`).
3. `worker` starts only after `web` is healthy, so it never runs against an
   outdated schema.

There is no manual database step, neither on the first install nor on updates.

## Before you start

1. **Choose the URL** people will open, e.g. `https://vault.home` on a LAN or
   `https://vault.example.com` on a server. On a LAN, make the hostname resolve
   to the server, either in your router / Pi-hole DNS or in each device's hosts
   file.
2. **Create a Twitch application** at https://dev.twitch.tv/console/apps and
   add `<your URL>/api/auth/callback/twitch` as an OAuth redirect URL.
3. **Create `.env`** from `.env.production.example`:
   - `BETTER_AUTH_URL`: your URL, with `https://`
   - `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
   - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
   - `POSTGRES_PASSWORD`: URL-safe, e.g. `openssl rand -hex 24`

## Home server or LAN

```bash
git clone https://github.com/Bumpfi/vault.git && cd vault
cp .env.production.example .env   # fill it in
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy listens on ports 80 and 443. If something else already uses them
(unraid's web interface does by default), set `HTTP_PORT` / `HTTPS_PORT` in
`.env`, e.g. 8080 / 8443, and include the port in your URL.

Open the URL, accept the certificate warning, and sign in. The browser warns
because the certificate comes from Caddy's own authority rather than a public
one. To remove the warning, copy the root certificate out of the container and
mark it as trusted on each device:

```bash
docker compose -f docker-compose.prod.yml cp caddy:/data/caddy/pki/authorities/local/root.crt ./vault-root.crt
```

## Coolify

1. **New resource → Git repository**, build pack **Docker Compose**.
2. **Docker Compose location:** `/docker-compose.coolify.yml`, then _Reload
   compose file_.
3. **Domain:** only on the `web` service, with the container port appended:
   `https://vault.example.com:3000`. The `:3000` tells Coolify which container
   port to route to; visitors still use the normal HTTPS port.
4. **Environment variables:** the ones from `.env.production.example`
   (without `HTTP_PORT` / `HTTPS_PORT`).
5. **Deploy**, then sign in right away. The first account becomes admin.
   On a public server, consider turning off **Open registration** in
   Settings → Administration.

Getting a 502? Check the `web` logs for a missing variable, make sure the
domain ends in `:3000`, and that the compose location isn't
`docker-compose.prod.yml` (its Caddy would compete with Coolify's proxy).

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

On Coolify, redeploy. Migrations run on startup.

### Upgrading an install from before versioned migrations

Older versions created the schema with `drizzle-kit push`. The first
migration (`drizzle/0000_baseline.sql`) is written to adopt such a database:
it adds what's missing, renames a few constraints and removes columns the app
never used. Your data (accounts, libraries, progress) is kept. As with any
schema change, take a backup first:

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U vault vault > vault-backup.sql
```

## Access control

- The first account to sign in becomes **admin**.
- Admins can turn **Open registration** off. Existing users always keep
  access.
- `ALLOWED_TWITCH_USER_IDS` (comma-separated Twitch user ids) additionally
  limits who may sign up.

## Operations

- **Logs:** `docker compose -f docker-compose.prod.yml logs -f web worker`
- **Backups:** everything lives in the `pgdata` volume; `pg_dump` as above.
- **"redirect_mismatch" on sign-in:** the redirect URL in the Twitch console
  must match `<BETTER_AUTH_URL>/api/auth/callback/twitch` exactly.
