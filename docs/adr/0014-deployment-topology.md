# 0014 — Deployment topology: Next.js on Vercel, API in containers

**Context.** The roadmap (Phase 23) keeps the backend out of serverless functions. The API needs a long-running process: background jobs and reminders (Phase 19), Redis-backed rate limits and slot holds, pooled PostgreSQL connections, realtime/video integrations (Phase 17), predictable cost at millions of visitors.

**Decision (product owner, 2026-10-07).**

| Service      | Platform                                                                                     | Domain           | Source                                             |
| ------------ | -------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------- |
| `apps/web`   | Vercel (Next.js, auto-detected)                                                              | `<domain>`       | Vercel project, Root Directory `apps/web`          |
| `apps/admin` | Vercel (Next.js, auto-detected)                                                              | `admin.<domain>` | second Vercel project, Root Directory `apps/admin` |
| `apps/api`   | Container platform — Railway, Render or Fly.io first; AWS / DigitalOcean when scale requires | `api.<domain>`   | `docker/api.Dockerfile`, target `runner`           |

- Each Vercel project sets `API_INTERNAL_URL=https://api.<domain>/api/v1`, `NEXT_PUBLIC_SITE_URL`, `APP_ENV` at **build time** (they are baked into the build — docs/docker.md).
- The API container sets its runtime environment (`DATABASE_URL`, `REDIS_URL`, secrets, `CORS_ORIGINS=https://<domain>,https://admin.<domain>`, `API_TRUST_PROXY` = number of proxies in front of it).
- Health checks: platform probes `GET /health/ready` (traffic) and `GET /health/live` (restart).
- The final container provider is picked in Phase 23; the image is provider-neutral.

**Consequences.** Frontends get Vercel's CDN, previews and zero-config Next.js builds; the API scales horizontally as stateless containers. Vercel's Express support is deliberately not used for the API.
