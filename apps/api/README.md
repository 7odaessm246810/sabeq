# apps/api — Express 5 (Backend API)

The brain of the platform. Port **4000**. Built in Phase 05.

- `/api/v1/*`, `/health/live`, `/health/ready`.
- Only service that talks to PostgreSQL, Redis, storage, Paymob, SMS, email, video.
- Stateless → scales horizontally behind a load balancer.
