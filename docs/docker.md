# SABEQ — Docker

One command runs the whole platform the same way on every machine.

## Services

| Service    | Image / build                              | Local URL                         | Notes                                                           |
| ---------- | ------------------------------------------ | --------------------------------- | --------------------------------------------------------------- |
| `postgres` | `postgres:18.6-alpine3.24`                 | `127.0.0.1:5432`                  | volume `pgdata`, `pg_isready` health check                      |
| `redis`    | `redis:8.8.3-alpine3.23`                   | `127.0.0.1:6379`                  | AOF persistence, volume `redisdata`                             |
| `migrate`  | `docker/api.Dockerfile` (dev / `migrator`) | —                                 | one-shot: `prisma migrate deploy`, then exits; api waits for it |
| `api`      | `docker/api.Dockerfile`                    | http://localhost:4000/health/live | waits for postgres + redis to be healthy                        |
| `web`      | `docker/next.Dockerfile` (`APP=web`)       | http://localhost:3000             | waits for api; `/healthz`                                       |
| `admin`    | `docker/next.Dockerfile` (`APP=admin`)     | http://localhost:3001             | waits for api; `/healthz`                                       |

Every port is bound to `127.0.0.1`, so nothing is exposed to the local network.

## Commands

| Goal                                    | Command                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Everything, hot reload                  | `pnpm docker:dev` → `docker compose up --build --watch`                  |
| Only the databases (fastest on Windows) | `pnpm docker:infra`, then `pnpm dev` on the host                         |
| Production-like images                  | `pnpm docker:prod` → `compose.yaml` + `compose.prod.yaml`                |
| Logs                                    | `pnpm docker:logs`                                                       |
| Stop                                    | `pnpm docker:down` (`docker compose down -v` also deletes database data) |

Optional: `cp .env.example .env`. Without it, the defaults in `compose.yaml` are used.

## How the images are built

Both Dockerfiles use the same stages:

1. **pruner** — `turbo prune @sabeq/<app> --docker`: keeps only the app and the workspace packages it uses.
2. **deps** — `pnpm install --frozen-lockfile` from manifests only. Cached until a `package.json` or the lockfile changes.
3. **dev** — the full source + `turbo run dev`. Used by `compose.yaml`; `--watch` syncs `src/` into the container, restarts on `packages/` changes, and rebuilds on lockfile changes.
4. **builder** — `turbo run build`. The API is then packed with `pnpm deploy --prod` (production deps only).
5. **runner** — the production image: Node 24 Alpine, **non-root user**, only the build output, `HEALTHCHECK`, graceful `SIGTERM` shutdown.

Image versions are pinned (Node `24.21.0-alpine3.24`, pnpm `11.21.0`, turbo `2.11.7`). Upgrades are deliberate commits.

## Build-time vs run-time configuration (important)

Next.js fixes some values **when the image is built**:

| Variable           | Why it is build-time                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_*`    | inlined into the browser JavaScript                                      |
| `API_INTERNAL_URL` | becomes the `/api/v1` rewrite target in `routes-manifest.json`           |
| `APP_ENV`          | `robots.txt` is generated statically (only `production` allows indexing) |

Pass them as `--build-arg` (see `compose.prod.yaml`). Each environment (local, staging, production) builds its own web/admin image. API settings (`DATABASE_URL`, secrets…) are normal run-time environment variables.

## Environment variables and Turborepo

Turborepo runs tasks in strict env mode: a task only sees variables listed in `turbo.json`.

- `build.env` — variables that change the build output (also part of the cache key).
- `dev.passThroughEnv` — the variable groups from `.env.example` (`API_*`, `DATABASE_URL`, `REDIS_*`, `AUTH_*`, …).

**Adding a variable with a new prefix = add it to `.env.example` and to `turbo.json`.** Otherwise the container receives it but the app does not.

## Windows notes

- Docker Desktop needs WSL 2. Development is smoothest with `pnpm docker:infra` (databases in Docker, apps on the host).
- Low space on `C:`: move Docker's disk image to another drive in Docker Desktop → Settings → Resources → Advanced → Disk image location.

## Troubleshooting

- **`ports are not available ... 5432`** — another PostgreSQL already listens on the host. Set `POSTGRES_HOST_PORT=5433` in `.env` (and use `localhost:5433` in `DATABASE_URL` for host tools). Containers are unaffected: they always talk to `postgres:5432`.
- **`pnpm install` times out during `docker compose build`** — slow connection. The Dockerfiles already raise timeouts and cache registry metadata; build one service at a time: `docker compose build web`, then `admin`, then `api`.
