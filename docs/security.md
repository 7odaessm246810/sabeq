# Security

How Sabeq protects its users, their money and their documents. Phase 21 (2026-10-11) reviewed every layer; this page is the checklist to keep it that way. Decisions with history live in [adr/](adr/README.md).

## What we protect

| Asset                                             | Where                                | Main risks                                       |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Accounts (phone + OTP)                            | `auth_sessions`, Redis               | OTP guessing, SMS flooding, session theft        |
| Students' and mentors' personal data              | PostgreSQL                           | leaks through logs, errors or other users' views |
| Mentor documents (national ID, certificates)      | object storage                       | access by anyone but verifiers                   |
| Payout details (InstaPay, wallets, bank accounts) | `payout_accounts`                    | leaks, changes before a transfer                 |
| Money (payments, refunds, mentor balances)        | Paymob, `payments`, `ledger_entries` | forged confirmations, double refunds or payouts  |

## Controls in place

**Identity and sessions**

- Phone OTP only, no passwords (ADR-0005). Codes are hashed, expire in minutes, 5 tries; per-number cooldown and per-IP hourly limits.
- Opaque session tokens in `httpOnly`, `SameSite=Lax` cookies (`Secure` + `__Host-` outside local); only their hash is stored; a different lifetime per app; checked on every request, so suspending an account or signing out ends it at once (ADR-0015).
- Roles checked on the server for every route (`requireRole`, `requireAdmin(…)`); admin sessions are separate from website sessions.

**Requests**

- CORS allowlist; cross-site POSTs carry no cookies (`SameSite=Lax`); all input validated with zod (`.strict()` — unknown fields are refused); body size capped; server time-outs set.
- **The visitor's IP** (rate limits, OTP limits, audit): browsers reach the API through the web / admin proxies (`proxy.ts`). The proxy drops whatever IP headers the browser sent and passes the IP from the hosting platform's header (`PROXY_CLIENT_IP_HEADER`) with the shared `API_PROXY_SECRET`; the API believes it only with that secret (timing-safe compare), otherwise it uses the connection's address. A client cannot change its IP with `X-Forwarded-For`.
- **Rate limits in Redis**, shared by every API instance: 300 requests / minute / IP overall, and tighter hourly budgets for actions worth abusing — holding slots, starting payments, cancelling, reviews, payout details, email changes and confirmations, uploads (`SENSITIVE_LIMITS`). If Redis is down the limiter lets requests through rather than taking the site down (logged).

**Browsers**

- API: `default-src 'none'` CSP, `nosniff`, no framing, `X-Request-Id`.
- Website and admin: a new **nonce per request** and `script-src 'self' 'nonce-…' 'strict-dynamic'` — only Next.js's own scripts run; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `connect-src 'self'`. The website may frame `https://*.daily.co` only (the session call); the admin nothing. HSTS and `upgrade-insecure-requests` outside local. Inline _styles_ are allowed (React `style` attributes); inline scripts are not.
  - Cost: every page renders per request (no static caching) — accepted for a site that handles accounts and money.

**Data**

- Errors never leak details to clients (generic message + request id); logs are JSON with cookies, tokens, OTPs, phones and card numbers redacted.
- Mentor documents encrypted with the document keys (AES-256-GCM, key id per file, ADR-0016) in a private bucket; every opening audited.
- Payout details sealed the same way and bound to the mentor; shown masked; finance opens them only to pay, audited.
- Images: type checked from the bytes, re-served with `nosniff` and a sandbox CSP.

**Money**

- A booking is confirmed only by Paymob's HMAC-signed callback for the right amount — never by the browser; callbacks recorded once (ADR-0006).
- Refunds recorded before they are sent and retried; payouts recorded under a row lock, never above the ledger balance; the ledger is append-only.
- Every admin change (refunds, reviews, accounts, payouts, catalog, verification) goes to the append-only `audit_logs` in the same transaction.

**Production refuses to start** without: HTTPS origins, a real SMS provider, `PAYMOB_MODE=paymob`, `VIDEO_PROVIDER=daily`, `EMAIL_PROVIDER=resend`, `API_PROXY_SECRET`, the document keys, a production build.

## Dependencies

`pnpm audit --prod` (2026-10-11): `mysql2` and `deepmerge-ts` (under the Prisma CLI) pinned to fixed versions with `overrides` in `pnpm-workspace.yaml`. Remaining: **braces** ≤ 3.0.3 (stack exhaustion on crafted glob patterns) under `@next/eslint-plugin-next` — lint tooling only, never shipped; no fixed release exists yet. Re-run the audit before every release.

## Before going live (Phase 23)

- [ ] Generate and set `API_PROXY_SECRET` (same value in api, web, admin) and `PROXY_CLIENT_IP_HEADER` for the hosting platform.
- [ ] Generate production `DOCUMENTS_ENCRYPTION_KEYS`; store them only in the platform's secret manager.
- [ ] **Roll every key that was ever pasted in a chat** (GitHub, Neon, R2, Cloudflare, Daily) and set the new ones only in the secret manager.
- [ ] Paymob callback URL on HTTPS; Resend domain verified (SPF / DKIM).
- [ ] Separate database roles: migrations vs the app (no DDL for the app).
- [ ] Run a DAST scan (HawkScan / ZAP) against staging.
