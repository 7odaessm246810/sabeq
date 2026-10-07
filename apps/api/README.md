# apps/api — Express 5 (Backend API)

The brain of the platform. Port **4000**. Details: [docs/api.md](../../docs/api.md).

- `/api/v1/*`, `/health/live`, `/health/ready`.
- Only service that talks to PostgreSQL, Redis, storage, Paymob, SMS, email, video.
- Stateless → scales horizontally behind a load balancer.

```bash
pnpm --filter @sabeq/api dev     # tsx watch
pnpm --filter @sabeq/api test    # vitest + supertest
```
