# apps/admin — Next.js (Admin dashboard)

Separate app on `admin.<domain>`. Port **3001**. Built from Phase 10 / 20.

- Own session cookie, never shared with `apps/web`; admin-only roles; 2FA required.
- Not indexed (`noindex`), can be IP-restricted at the edge.
- Talks to `apps/api` `/api/v1/admin/*` only.
