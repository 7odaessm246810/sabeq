# 0003 — web, admin and api are separate services

**Decision.** `apps/web` (students + mentors), `apps/admin` (dashboard) and `apps/api` (Express) are built, deployed and scaled separately. The admin app lives on its own subdomain with its own session.

**Consequences.** A traffic spike on the public site cannot take down the admin. The admin attack surface is isolated. The API scales horizontally on its own, so it must stay stateless: sessions and locks in Redis, files in object storage.
