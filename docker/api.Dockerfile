# syntax=docker/dockerfile:1.7
#
# Express API (apps/api).
#
# Targets
#   dev     — `tsx watch` with hot reload (compose.yaml + `docker compose watch`)
#   runner  — production image: compiled JS + production deps only, non-root, health-checked
#
# Stages: base → pruner (turbo prune) → deps (pnpm install, cached) → dev | builder → runner.

ARG NODE_IMAGE=node:24.21.0-alpine3.24

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    TURBO_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat \
 && npm install --global pnpm@11.21.0 turbo@2.11.7
WORKDIR /app

# ---------------------------------------------------------------------------
FROM base AS pruner
COPY . .
RUN turbo prune @sabeq/api --docker

# ---------------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner /app/out/json/ .
# Slow links: fewer parallel requests, longer timeouts, and a persistent metadata cache so a retry
# does not download everything again (pnpm verifies release age against full registry metadata).
ENV pnpm_config_fetch_timeout=600000 \
    pnpm_config_fetch_retries=5
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --network-concurrency=6

# ---------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development
COPY --from=pruner /app/out/full/ .
EXPOSE 4000
CMD ["turbo", "run", "dev", "--filter=@sabeq/api"]

# ---------------------------------------------------------------------------
FROM deps AS builder
ENV NODE_ENV=production
COPY --from=pruner /app/out/full/ .
RUN turbo run build --filter=@sabeq/api
# Self-contained folder: compiled API + production dependencies (workspace packages copied, not linked).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @sabeq/api deploy --prod --legacy --store-dir /pnpm/store /prod/api

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    API_PORT=4000
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.API_PORT+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
