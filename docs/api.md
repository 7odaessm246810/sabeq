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

## Operations

- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting, finish in-flight requests, exit within 10 s.
- `keepAliveTimeout` 65 s / `headersTimeout` 66 s — longer than load-balancer idle timeouts (avoids 502s).
- Unhandled rejections / exceptions are logged as `fatal` and exit; the orchestrator restarts the container.

## Known limits (tracked)

- Rate limits use an in-memory store — exact per instance. **Phase 21** switches to Redis so the budget is shared across containers.
- No authentication yet — **Phase 07**.

## Tests

`pnpm --filter @sabeq/api test` — supertest against `createApp()`: envelope, request ids, security headers, CORS, rate limit, validation, malformed and oversized bodies, error sanitization, readiness, config validation.
