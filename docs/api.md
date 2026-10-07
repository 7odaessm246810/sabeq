# SABEQ — API foundation (`apps/api`)

Express 5 on Node 24, TypeScript, ESM. Base path **`/api/v1`**.

## Layout

```
apps/api/src/
├── server.ts            process entry: config → app → listen → graceful shutdown
├── app.ts               createApp(): middleware order, /health, /api/v1, 404, errors
├── config/env.ts        the only reader of process.env (zod, fails fast)
├── core/
│   ├── errors.ts        AppError, Errors.*, status + Arabic message per code
│   ├── http.ts          sendData(), parseInput(), zodFields()
│   ├── logger.ts        pino with redaction of secrets and personal data
│   └── middleware/
│       ├── request-context.ts   X-Request-Id + one log line per request
│       ├── security.ts          helmet, CORS allowlist, rate limit
│       └── errors.ts            notFound + the single error handler
└── modules/
    └── health/          /health/live, /health/ready
```

Feature modules (Phase 07+) follow `docs/architecture.md` §4: `routes → controller → service → repository`, mounted through `createApp({ mountV1 })`.

## Request pipeline

1. **Request context** — reuses a safe incoming `X-Request-Id` or creates a UUID; returned on every response and in every error body.
2. **Security headers** — helmet; CSP `default-src 'none'` (JSON only), HSTS, `nosniff`, no `X-Powered-By`.
3. **`/health/*`** — outside rate limits and CORS; not logged.
4. **`/api/v1`** — CORS allowlist → rate limit (per client IP) → JSON body (size-limited) → routes.
5. **404** → **error handler**.

## Responses

Success: `{ "data": …, "meta"?: { "nextCursor", "limit" } }` — `sendData(res, data, meta?, status?)`.

Failure: `{ "error": { "code", "message", "fields"?, "requestId" } }`.

| code                            | HTTP                           | when                                       |
| ------------------------------- | ------------------------------ | ------------------------------------------ |
| `VALIDATION_FAILED`             | 400 (413 for oversized bodies) | zod failure, malformed JSON                |
| `UNAUTHENTICATED`               | 401                            | no / expired session (Phase 07)            |
| `PAYMENT_FAILED`                | 402                            | Phase 16                                   |
| `FORBIDDEN`                     | 403                            | role not allowed, origin not allowed       |
| `NOT_FOUND`                     | 404                            | unknown route or resource                  |
| `CONFLICT` / `SLOT_UNAVAILABLE` | 409                            | write conflicts, slot taken                |
| `RATE_LIMITED`                  | 429                            | budget spent (`Retry-After`)               |
| `INTERNAL`                      | 500                            | anything unexpected — details only in logs |

Messages are user-facing Egyptian Arabic and never contain technical details. Throw, don't respond:

```ts
const body = parseInput(createBookingSchema, req.body); // VALIDATION_FAILED with fields
if (!slotFree) throw Errors.slotUnavailable();
sendData(res, booking, undefined, 201);
```

Express 5 forwards rejected promises to the error handler — no `try/catch` or async wrappers in routes.

## Configuration

| Variable                                          | Default             | Notes                                                        |
| ------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| `API_PORT`                                        | 4000                |                                                              |
| `LOG_LEVEL`                                       | info                | `silent` in tests                                            |
| `CORS_ORIGINS`                                    | localhost:3000,3001 | must be `https://` when `APP_ENV=production`                 |
| `API_TRUST_PROXY`                                 | 0                   | proxy hops in front of the API — Docker: 1 (Next.js rewrite) |
| `API_RATE_LIMIT_WINDOW_MS` / `API_RATE_LIMIT_MAX` | 60000 / 300         | per client IP on `/api/v1`                                   |
| `API_BODY_LIMIT`                                  | 100kb               |                                                              |

An invalid value stops the process with a list of every problem.

## Health

- `GET /health/live` → `200 {status:"ok"}` while the process runs (restart if not).
- `GET /health/ready` → `200` when every registered check passes, `503` otherwise. Checks time out after 2 s. PostgreSQL and Redis checks are registered in Phase 06.

## Authentication (Phase 07)

Phone + OTP (ADR-0005), opaque session cookies (ADR-0015). Module: `src/modules/auth`.

| Endpoint (website: `/api/v1/auth`, admin app: `/api/v1/admin/auth`) | Body                     | Result                                                                                       |
| ------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `POST otp/request`                                                  | `{ phone }`              | `202 { expiresInSeconds, resendAfterSeconds, devCode? }` — `devCode` only in `APP_ENV=local` |
| `POST otp/verify`                                                   | `{ phone, code, role? }` | `200 { user, isNew }` + session cookie                                                       |
| `GET me`                                                            | —                        | `200 { user, session }` / `401`                                                              |
| `POST logout` · `POST logout-all`                                   | —                        | `200`, cookie cleared                                                                        |

- **OTP:** 6 digits, 5 minutes, single use, 5 wrong guesses burn it. Stored as an HMAC in Redis. Throttled: 30 s between sends, 10 per number per day, 30 sends and 60 checks per IP per hour (`429` + `Retry-After`).
- **Accounts:** a new number on the website becomes a student (with a student profile) or a mentor applicant, as picked on the login screen. An existing account keeps its role. Admin numbers cannot log into the website; admins log in only through `/admin/auth` and only if created with `pnpm admin:create` (no SMS is sent to other numbers there, same answer either way).
- **Protecting routes:** `router.use(auth.authenticate('web' | 'admin'))`, then `requireAuth()`, `requireRole('student')`, `requireAdmin('finance')` (`super_admin` passes every admin check). No session → `401`; wrong role → `403`.
- **Revocation:** `sessions.revokeAll(userId)` on suspension / role change — takes effect immediately (Redis cache entry deleted).

## Account (Phase 08)

Website user's own account under `/api/v1/me` (module `src/modules/account`, website session required).

| Endpoint             | Body                                                           | Result                                              |
| -------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| `GET profile`        | —                                                              | `{ profile: { fullName, phone, role, student } }`   |
| `PATCH profile`      | `{ fullName?, track?, schoolYear?, governorate?, interests? }` | updated profile                                     |
| `GET devices`        | —                                                              | live website sessions, `current` flagged            |
| `DELETE devices/:id` | —                                                              | signs that device out (own sessions only, else 404) |

- Student fields (`track`, `schoolYear` 1–3, `governorate` from the 27, `interests` ≤ 5 faculty-kind slugs) are refused for mentors. `null` clears a field; omitted fields are untouched. Unknown fields → 400.
- The vocabulary (tracks, years, governorates, labels) lives in `@sabeq/types` (`student.ts`), shared with the web app.
- Integration tests seed the catalog (`scripts/test-db.ts` runs `prisma/seed.ts` without demo mentors).

## Operations

- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting, finish in-flight requests, exit within 10 s.
- `keepAliveTimeout` 65 s / `headersTimeout` 66 s — longer than load-balancer idle timeouts (avoids 502s).
- Unhandled rejections / exceptions are logged as `fatal` and exit; the orchestrator restarts the container.

## Known limits (tracked)

- Rate limits use an in-memory store — exact per instance. **Phase 21** switches to Redis so the budget is shared across containers.
- OTP codes are logged (console SMS) — a real SMS provider is required before production; config refuses `SMS_PROVIDER=console` there.
- Admin second factor (TOTP) — **Phase 21**.

## Tests

`pnpm --filter @sabeq/api test` — supertest against `createApp()`: envelope, request ids, security headers, CORS, rate limit, validation, malformed and oversized bodies, error sanitization, readiness, config validation.
