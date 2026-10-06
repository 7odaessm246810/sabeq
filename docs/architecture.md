# SABEQ — Architecture

## 1. System overview

```
                   Browser (student / mentor)          Browser (admin)
                            │                                 │
                   https://<domain>                  https://admin.<domain>
                            │                                 │
                 ┌──────────▼──────────┐           ┌──────────▼──────────┐
                 │  apps/web  (Next.js) │           │ apps/admin (Next.js) │
                 │  SSR/ISR pages + BFF │           │  dashboard + BFF     │
                 │  proxy /api/v1/*     │           │  proxy /api/v1/*     │
                 └──────────┬──────────┘           └──────────┬──────────┘
                            │      server-to-server HTTPS      │
                            └───────────────┬──────────────────┘
                                            ▼
                              ┌───────────────────────────┐
                              │  apps/api  (Express 5)    │  https://api.<domain>
                              │  stateless · horizontal   │  /api/v1/*  /health/*
                              └─┬─────┬──────┬──────┬────┬┘
                                │     │      │      │    │
                         PostgreSQL Redis Storage Paymob  SMS · Email · Video
                         (Prisma)  (cache, (S3,   (webhooks
                                   OTP,    private  HMAC)
                                   queues) docs)
```

| Service           | Tech                                          | Port (local) | Production host  | Scales by                                     |
| ----------------- | --------------------------------------------- | ------------ | ---------------- | --------------------------------------------- |
| `apps/web`        | Next.js 16 · React 19                         | 3000         | `<domain>`       | CDN + ISR + serverless/edge (Vercel)          |
| `apps/admin`      | Next.js 16 · React 19                         | 3001         | `admin.<domain>` | small, low traffic                            |
| `apps/api`        | Node 24 LTS · Express 5                       | 4000         | `api.<domain>`   | N stateless containers behind a load balancer |
| worker (Phase 19) | same code as `apps/api`, different entrypoint | —            | private          | N containers consuming Redis queues           |
| PostgreSQL        | managed                                       | 5432         | private network  | read replicas + PgBouncer pooling             |
| Redis             | managed                                       | 6379         | private network  | —                                             |

**Rule:** only `apps/api` touches the database, Redis, storage and third-party providers. The Next.js apps hold **no secrets** and have **no database access**.

## 2. How Next.js talks to Express (ADR-0004)

1. **Browser → same origin.** The browser calls `/api/v1/...` on its own host (`<domain>` or `admin.<domain>`). Each Next app rewrites that path to the API. Result: no CORS for app traffic, and auth cookies are **host-only** — the admin cookie never reaches the student site, and vice versa.
2. **Server Components → API directly.** Pages rendered on the server call `API_INTERNAL_URL` and forward the incoming request's cookies. Public pages (landing, explore, faculty, mentor profile) use cached fetches / ISR, so millions of visitors mostly hit the CDN, not the API.
3. **Shared contracts.** Request/response types and enums come from `@sabeq/types`, so the two sides cannot drift.
4. **Response envelope.** `{ data, meta? }` on success, `{ error: { code, message, fields?, requestId } }` on failure (see `packages/types/src/api.ts`).

## 3. Monorepo layout

```
sabeq/
├── apps/
│   ├── web/              Next.js — public site + student + mentor
│   ├── admin/            Next.js — admin dashboard (separate app, separate auth)
│   └── api/              Express 5 — REST API /api/v1 (+ worker entrypoint later)
├── packages/
│   ├── config/           tsconfig + eslint presets (no runtime code)
│   ├── types/            shared domain contracts: roles, statuses, API envelope
│   ├── utils/            pure helpers: money (piasters), Egyptian phone, …
│   ├── tokens/           design tokens → CSS variables      (Phase 03)
│   └── ui/               design-system React components     (Phase 04)
├── docker/               Dockerfiles + compose overrides    (Phase 02)
├── docs/                 roadmap, architecture, conventions, ADRs
├── .env.example          every env variable, documented
├── pnpm-workspace.yaml   workspaces + version catalog
└── turbo.json            task pipeline (build → lint/typecheck/test)
```

**Dependency direction (enforced by review, later by lint):**

```
apps/*  ──▶  packages/ui ──▶ packages/tokens
   │              │
   └──────────────┴──▶ packages/utils ──▶ packages/types
packages/config  ◀── dev-only, used by everyone
```

- `packages/*` never import from `apps/*`.
- `packages/types` and `packages/utils` are framework-free (no React, no Express) and run in browser and Node.
- `apps/web` and `apps/admin` never import each other.

## 4. Backend module layout (Phase 05)

The API is organised **by feature module**, each with the same layers. This keeps a large codebase navigable:

```
apps/api/src/
├── app.ts / server.ts
├── config/            env parsing (zod) — the only place that reads process.env
├── core/              errors, logger, http helpers, middleware (auth, rate limit, request id)
├── infra/             prisma client, redis, storage, queue — adapters to the outside world
├── providers/         sms/, payments/, email/, video/ — interface + implementations
└── modules/
    ├── auth/          routes.ts · controller.ts · service.ts · repository.ts · schemas.ts · *.test.ts
    ├── students/
    ├── mentors/
    ├── catalog/       universities · faculties · departments · specializations
    ├── availability/
    ├── bookings/
    ├── payments/
    ├── sessions/
    ├── reviews/
    ├── notifications/
    └── admin/
```

Layer rules: **route → controller (HTTP only) → service (business rules) → repository (Prisma only)**. Services never see `req`/`res`; controllers never call Prisma.

## 5. Cross-cutting rules

- **Money** is an integer number of piasters everywhere (ADR-0010). Commission = 10% (ADR-0009).
- **Time** is stored UTC, displayed in `Africa/Cairo`.
- **Payment truth** comes only from verified Paymob webhooks — never from the browser (ADR-0006).
- **Bookings** use a short Redis slot-hold + a database uniqueness constraint so a slot can never be sold twice.
- **Files** (mentor IDs, certificates) go to a private bucket and are served only through short-lived signed URLs.
- **Audit log** for every admin action and every money movement.
