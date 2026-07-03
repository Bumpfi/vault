# Single image for both `web` and `worker` (worker overrides the command).
# Contains the built Nitro server (.output) for web + source/node_modules for
# the tsx worker.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

FROM base AS build
# Install deps (incl. dev — needed for the build and the tsx worker).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN pnpm install --frozen-lockfile
COPY . .
# Produces .output/server/index.mjs (standalone Node server).
RUN pnpm build && pnpm run build:worker

FROM base AS runtime
ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src ./src
COPY --from=build /app/worker ./worker

EXPOSE 3000
# Default = web. docker-compose overrides command for the worker.
CMD ["node", ".output/server/index.mjs"]
