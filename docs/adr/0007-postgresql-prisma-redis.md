# 0007 — PostgreSQL + Prisma, Redis

**Decision (product owner, 2026-10-06).** PostgreSQL is the system of record: relational data, transactions, and constraints that prevent double booking. Prisma handles schema, migrations and typed queries. Redis handles rate limits, OTPs, slot holds, caching and job queues.

**Consequences.** Connection pooling (PgBouncer or Prisma pooling) is required once the API scales out. Raw SQL is allowed inside repositories for search and reporting queries where Prisma is weak.
