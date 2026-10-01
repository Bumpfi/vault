# One image for both processes (web and worker); docker-compose picks the
# command. The runtime stage contains only build output: the web server, the
# bundled worker/migrate scripts and the SQL migrations — no source code and
# no node_modules.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
# Apply pending migrations, then start the web server.
CMD ["sh", "-c", "node .output/jobs/migrate.cjs && exec node .output/server/index.mjs"]
