# 0004 — Next.js ↔ API communication

**Context.** Server-rendered pages need the user's session, but cookies set on `api.<domain>` are not sent to `<domain>`. Sharing a parent-domain cookie instead would leak the admin session to the student site.

**Decision.**

- Each Next app rewrites `/api/v1/*` on its own host to the API, so browsers only talk to their own origin.
- Auth cookies are `HttpOnly; Secure; SameSite=Lax` and **host-only** (no `Domain=`), with different names for web and admin.
- Server Components call `API_INTERNAL_URL` directly and forward the request cookies.
- The API still enforces a strict CORS allowlist, and trusts `X-Forwarded-For` only from known proxies (needed for per-IP rate limits).

**Consequences.** No CORS in normal traffic, sessions isolated per app, and SSR works with auth. Client-side API calls take one extra hop, which is acceptable for JSON; public pages are served from cache.
