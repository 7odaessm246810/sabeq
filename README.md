# SABEQ · سابق

> اسأل من سبقك. واختار طريقك بشكل أفضل.

SABEQ connects Egyptian high-school students with **verified** university students and graduates for paid advice sessions about the faculty they are considering.

## Apps

| App                        | What                                     | Local                 |
| -------------------------- | ---------------------------------------- | --------------------- |
| [`apps/web`](apps/web)     | Next.js — public site, students, mentors | http://localhost:3000 |
| [`apps/admin`](apps/admin) | Next.js — admin dashboard                | http://localhost:3001 |
| [`apps/api`](apps/api)     | Express 5 — REST API `/api/v1`           | http://localhost:4000 |

Shared packages: [`config`](packages/config) · [`types`](packages/types) · [`utils`](packages/utils) · [`tokens`](packages/tokens) · [`ui`](packages/ui).

## Quick start

```bash
# Node 24 LTS + pnpm 11
pnpm install
cp .env.example .env
pnpm check        # format + lint + typecheck + test
pnpm dev
```

### With Docker

```bash
docker compose up --build --watch   # postgres + redis + api + web + admin, hot reload
```

Details, production-like images and Windows notes: [docs/docker.md](docs/docker.md).

## Docs

- [Docker](docs/docker.md)
- [API foundation](docs/api.md)
- [Roadmap — 23 phases](docs/ROADMAP.md)
- [Architecture](docs/architecture.md)
- [Conventions](docs/conventions.md)
- [Environments](docs/environments.md)
- [Development workflow](docs/workflow.md)
- [Architecture decisions (ADRs)](docs/adr/README.md)

Design source of truth: the SABEQ design handoff (prototype + design system + screenshots), light mode only — see [ADR-0012](docs/adr/0012-design-source-light-only.md).
