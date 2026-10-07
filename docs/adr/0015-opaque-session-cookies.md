# 0015 — Opaque server-side sessions in httpOnly cookies

**Context.** After OTP verification (ADR-0005) the browser needs to stay signed in. Accounts hold money (bookings, refunds, mentor payouts) and admins see national-ID documents, so a session must stop working the moment an account is suspended or someone logs out "everywhere". The browser talks to the API only through the Next.js rewrite on its own origin (ADR-0004).

**Decision (Phase 07, 2026-10-07).**

- Sessions are rows in `auth_sessions`. The cookie holds a random 32-byte token; the database keeps only its SHA-256 (`token_hash`), so a database leak exposes no live sessions.
- No JWTs and no refresh tokens: one opaque token per session, looked up per request and cached in Redis for 5 minutes. Revoking deletes the cache entry, so it takes effect immediately.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` with the `__Host-` prefix outside local development. Separate cookies for the website (`sb_session`, 30 days) and the admin app (`sb_admin`, 12 hours) — an admin cookie is never a website session and vice versa.
- CSRF: `SameSite=Lax` + the CORS allowlist (requests whose `Origin` is not ours are refused) + JSON-only bodies.
- Admin accounts are never created by sign-up — only by `pnpm admin:create` — and every admin login is written to `audit_logs`. The second factor for admins (TOTP, ADR-0005) is added in Phase 21 before production.

**Consequences.** One Redis read per request (a database read every few minutes per session). Suspending an account must call `sessions.revokeAll(userId)`. Server components that need the user forward the cookie to `/api/v1/auth/me`.
