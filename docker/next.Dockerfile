# syntax=docker/dockerfile:1.7
#
# One Dockerfile for both Next.js apps:  --build-arg APP=web | admin
#
# Targets
#   dev     — `next dev` with hot reload (used by compose.yaml + `docker compose watch`)
#   runner  — production image: standalone server, non-root, health-checked (compose.prod.yaml, deploys)
#
# Stages: base → pruner (turbo prune: only this app + its workspace deps) → deps (pnpm install,
# cached) → dev | builder → runner.

ARG NODE_IMAGE=node:24.21.0-alpine3.24

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat \
 && npm install --global pnpm@11.21.0 turbo@2.11.7
WORKDIR /app

# ---------------------------------------------------------------------------
FROM base AS pruner
ARG APP
COPY . .
RUN turbo prune "@sabeq/${APP}" --docker

# ---------------------------------------------------------------------------
FROM base AS deps
# Manifests + lockfile only, so this layer is reused until dependencies change.
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
ARG APP
ENV APP=${APP} \
    NODE_ENV=development
COPY --from=pruner /app/out/full/ .
EXPOSE 3000 3001
# Builds the workspace packages this app depends on (tokens, types, ui…), then runs `next dev`.
CMD ["sh", "-c", "turbo run dev --filter=@sabeq/${APP}"]

# ---------------------------------------------------------------------------
FROM deps AS builder
ARG APP
# These are fixed at BUILD time, not at container start:
# - NEXT_PUBLIC_* are inlined into the browser bundle;
# - API_INTERNAL_URL becomes the /api/v1 rewrite target in routes-manifest.json;
# - APP_ENV decides robots.txt, which is generated statically.
# Each environment (local, staging, production) therefore builds its own image.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG API_INTERNAL_URL=http://api:4000/api/v1
ARG APP_ENV=local
ENV NODE_ENV=production \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    API_INTERNAL_URL=${API_INTERNAL_URL} \
    APP_ENV=${APP_ENV}
COPY --from=pruner /app/out/full/ .
RUN turbo run build --filter="@sabeq/${APP}"

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
ARG APP
ENV APP=${APP} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/public ./apps/${APP}/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
