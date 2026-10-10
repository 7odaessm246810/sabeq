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

## Mentor application (Phase 09)

Applicant side of onboarding under `/api/v1/mentor/application` (module `src/modules/mentor-application`, mentor accounts only). Documents: ADR-0016.

| Endpoint               | Body                                                                                                        | Result                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /`                | —                                                                                                           | `{ application                                                   | null }` (latest, with document metadata) |
| `PUT /`                | `{ fullName?, kind?, universitySlug?, facultyId?, major?, graduationYear?, basePriceEgp?, days?, topics? }` | draft saved (partial; `null` clears)                             |
| `POST documents/:slot` | raw file, slot `credential`                                                                                 | `national_id_front`                                              | `201 { document }`; replaces that slot   |
| `DELETE documents/:id` | —                                                                                                           | removed (row + object)                                           |
| `POST submit`          | —                                                                                                           | `submitted`, or `400` listing **every** missing field / document |

- States: `draft → submitted → under_review → approved | rejected`, with `changes_requested` sending it back to the applicant (Phase 10 drives the admin transitions). Editing is allowed in `draft` and `changes_requested` only (`409` otherwise). After a rejection a new application can be started; the database allows one open application per person.
- `kind`: `graduate` (degree certificate), `teaching_assistant` / `professor` (proof of employment). Price 100–500 EGP in steps of 10. Professors may omit the graduation year.
- Submission is audited (`mentor_application.submit`).
- `GET /api/v1/catalog/universities` — universities with their faculties (public, cached 5 min), used by the form.
- Known limit: an upload over 10 MB gets `413` from the API, but the Next.js proxy reports it as `500` because the API stops reading early. The web form blocks such files before sending.

## Catalog (Phase 11)

Module `src/modules/catalog`. Public reads are cached by clients for 5 minutes (`Cache-Control: public, max-age=300`); the web app's server components cache them for 5 minutes too, so an admin edit is live within that time.

| Endpoint                           | Result                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /catalog/universities`        | active universities with their faculties (mentor application form)                                                                                                                                                                                                                                   |
| `GET /catalog/faculty-kinds`       | every active faculty kind: summary, study years, category, listed-mentor count, universities, departments (/explore)                                                                                                                                                                                 |
| `GET /catalog/faculty-kinds/:slug` | one faculty page: about, generic info, published insights, merged departments, and `faculties[]` — every university offering it, with city, NAQAAE accreditation (status, expiry, accredited programmes), 2026 cutoffs and its own departments + source — plus `sources`; `404` if unknown or hidden |
| `GET /catalog/faculties`           | search (/explore): `q`, `governorate`, `university`, `category`, `kind`, `type`, `page`, `pageSize` (≤ 48) → `{ total, page, pageSize, results, facets }`. Each facet counts what the other filters leave. Cached 1 min                                                                              |
| `GET /catalog/faculties/:id`       | one faculty at one university (/college/:id): logo, place, website, about, kind texts, accreditation, cutoffs, departments + source, `sources`; `404` if unknown or hidden                                                                                                                           |
| `GET /media/logos/:name`           | a university / faculty logo (bundled with the API or uploaded by an admin); `immutable`, sandboxed CSP, `nosniff`                                                                                                                                                                                    |

Admin curation under `/api/v1/admin/catalog` (`super_admin`, `support`; every write audited as `catalog.*`): edit a faculty kind's texts / visibility, add / hide / delete insights, add / rename / hide departments per university faculty, rename / hide universities. Hiding a university removes it and its faculties from every public read.

Universities and faculties (Phase 11c, same roles, audited as `catalog.university.*`, `catalog.faculty.*`, `catalog.cutoff.*`):

- `POST /universities`, `GET|PATCH|DELETE /universities/:id`, `POST /faculties`, `GET|PATCH|DELETE /faculties/:id`.
- `PUT|DELETE /universities/:id/logo`, `PUT|DELETE /faculties/:id/logo` — raw PNG / JPEG / WebP body ≤ 512 KB; the type is sniffed from the bytes (no SVG). Stored unencrypted under `logos/` in object storage; a faculty without its own logo shows its university's.
- `POST /faculties/:id/cutoffs` (upsert by year + track + phase, source URL required), `DELETE /cutoffs/:id`.
- `DELETE` answers `409` when something depends on the row (a university with faculties; a faculty with mentors or mentor applications) — hide it instead (`isActive: false`).
- Rows an admin creates or edits get `admin_edited_at`; the research seed never updates, hides or re-uses them.
- Search runs on an in-memory index of all active faculties (rebuilt every minute and right after an admin write on that instance), with Arabic spelling folded (`@sabeq/utils` → `normalizeArabic`).

## Mentor profiles (Phase 12)

Module `src/modules/mentors`. Only listed mentors (`is_listed`, set by an approved application) whose account is active are ever public.

| Endpoint                       | Result                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /mentors`                 | discovery (Phase 13): `q`, `field`, `faculty`, `university` (one slug or several, comma-separated), `minRating`, `maxPrice`, `available=1` (a bookable slot within 7 days — «متاح الأسبوع ده»), `sort` (`recommended`                                                                           | `rating`                                                                                                                                                                                                                                                                           | `price_asc` | `price_desc` | `sessions`), `page`, `pageSize` (≤ 24) → `{ total, page, pageSize, results, facets: { fields, universities, price } }`. Runs on an in-memory index of listed mentors (1 min, refreshed after the mentor's own edits), Arabic spelling folded; each facet counts what the other filters leave. Cached 1 min |
| `GET /mentors/:slug`           | the profile: card + bio, department, the three session types with prices derived from the base price (×1, ×1.3, ×0.5, rounded to 10 EGP — `sessionPricePiasters`), latest published reviews (reviewer's first name only). `rating` is `null` until the first review. `404` if unknown or hidden |
| `GET`                          | `PATCH /me/mentor`                                                                                                                                                                                                                                                                              | (role `mentor`) the mentor's own profile: `bio`, `city` (governorate), `topics` (≤ 6), `basePriceEgp` (100–500, step 10), `acceptsBookings`, `departmentId` (must be in their faculty). Verified facts (kind, faculty, major, graduation year) are read-only. `404` until approved |
| `PUT`                          | `DELETE /me/mentor/photo`                                                                                                                                                                                                                                                                       | profile photo: raw PNG / JPEG / WebP ≤ 512 KB, sniffed; served at `/media/avatars/:name`                                                                                                                                                                                           |
| `GET /me/saved-mentors`, `PUT` | `DELETE /me/saved-mentors/:slug`                                                                                                                                                                                                                                                                | (role `student`) the design's «احفظ»; saving is idempotent                                                                                                                                                                                                                         |

## Availability & scheduling (Phase 14)

Module `src/modules/scheduling`. Weekday 0 = Sunday … 6 = Saturday; minutes since midnight, **Cairo time** (Egypt's daylight saving time is handled per date — `@sabeq/utils` `cairoToInstant`).

| Endpoint                                                                      | Result                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /mentors/:slug/availability?kind`                                        | `{ timezone, kind, durationMin, acceptsBookings, next, days: [{ date, slots: [ISO…] }] }` for 21 days. Slots start every 30 min inside the mentor's windows and must fit the session; at least 12 h notice; pending / confirmed bookings are never offered. Empty when the mentor isn't taking bookings. Cached 30 s |
| `GET /me/availability`                                                        | (role `mentor`) `{ rules, exceptions (from today), upcoming (first 6 slots students see), limits }`                                                                                                                                                                                                                  |
| `PUT /me/availability/rules`                                                  | `{ rules: [{ weekday, startMinute, endMinute }] }` replaces the weekly hours: 30-minute steps, ≥ 45 min, ≤ 4 ranges a day, no overlaps (also a DB exclusion constraint)                                                                                                                                              |
| `POST /me/availability/exceptions` · `DELETE /me/availability/exceptions/:id` | `{ date, kind: blocked                                                                                                                                                                                                                                                                                               | extra, startMinute?, endMinute? }` — a blocked day (no hours) or hours, or extra hours on a date; today to 90 days ahead |

Cards and profiles carry `nextSlot` (first 45-minute slot). On approval (Phase 10) the mentor gets 18:00–21:00 on the days chosen in the application; existing bookings are never touched by later changes. The single guarantee against double booking is the `bookings_no_overlap` exclusion constraint (Phase 15 books inside it).

## Bookings (Phase 15)

Module `src/modules/bookings`. Rules live in `@sabeq/types` (`booking.ts`) so the website shows exactly what the API enforces.

| Endpoint                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /bookings`                                           | (student) `{ mentorSlug, kind, startsAt, note? }` → `pending` booking holding the slot for 10 min. The slot must be one of the mentor's current slots; the student can't overlap their own sessions or hold more than 3 unpaid slots. Price, fee (15 EGP, decision 2026-10-10) and 10% commission are snapshotted. Two students racing for one slot: the `bookings_no_overlap` exclusion constraint lets exactly one through, the other gets `409` |
| `POST /bookings/:id/cancel`                                | student or mentor, before the start. Refund share: student ≥ 24 h before → 100 % (fee included); student later → 50 % of the session price; mentor → 100 %; unpaid → nothing. Recorded as `refund_share_bps`; a paid booking is refunded through the gateway (Payments below). Notifies the other side                                                                                                                                             |
| `POST /bookings/:id/complete` · `/no-show`                 | mentor, after the end / 15 min after the start, and only if the mentor opened the session room. Completing increments `sessions_completed`; both write the mentor's earning (a student who never came isn't refunded). `/no-show` is refused if the student opened the room                                                                                                                                                                        |
| `GET /bookings?scope=upcoming\|past` · `GET /bookings/:id` | the user's own bookings (by role), with the latest `payment` (`status`, `method`, `failureReason`, `kioskReference`); history leaves out bookings that were never paid                                                                                                                                                                                                                                                                             |

A sweeper runs every minute on each API instance (idempotent): unpaid holds expire and free their slot (scheduling also ignores expired holds), and confirmed sessions nobody marked complete themselves 24 h after they end.

## Payments (Phase 16)

Module `src/modules/payments`, behind a `PaymentGateway` (ADR-0006): `PAYMOB_MODE=paymob` uses Paymob's Intention API and Unified Checkout (Paymob hosts the card / wallet / kiosk pages — card numbers never reach Sabeq); `PAYMOB_MODE=fake` (local and tests only — the config refuses it in production) serves a test checkout page from the API that signs a Paymob-shaped callback with HMAC and sends it through the same handler.

| Endpoint                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /bookings/:id/pay`                                                 | (the student holding it) `{ method: card\|wallet\|kiosk }` → `{ redirectUrl, paymentId }`: a `pending` payment, and the gateway's checkout to send the browser to. Kiosk (Aman / Masary) only for sessions ≥ 48 h away, and holds the slot 24 h. `409` if the hold expired                                                                                                                                                                          |
| `GET /payments/methods`                                                  | `{ methods, mode }` — the methods this account has an integration for                                                                                                                                                                                                                                                                                                                                                                               |
| `POST /payments/paymob/webhook?hmac=`                                    | Paymob's transaction callback. Always `200`. Recorded once in `payment_events` (unique per transaction state — retries are ignored); acted on only if the HMAC-SHA512 is valid and the amount matches. Success → payment `succeeded` + booking `confirmed` (an expired hold is revived if the slot is still free, otherwise everything is refunded); kiosk pending → the code is stored; failure → payment `failed`, the hold stays for another try |
| `GET` · `POST /payments/fake/checkout/:paymentId[/success\|fail\|kiosk]` | fake mode only: the test checkout page and its outcomes (303 back to the website)                                                                                                                                                                                                                                                                                                                                                                   |

The website's `/book/:slug/done?booking=` page (where checkout returns) only reads the booking — coming back from checkout proves nothing. Refunds: a cancellation with money to return records a `pending` refund and sends it (`void_refund/refund`); on success the payment becomes `refunded` / `partially_refunded` and the booking `refunded`. A gateway error leaves it pending and the sweeper retries it after 2 min. Completing a session writes the mentor's `mentor_earning` (price − commission) to the append-only ledger; payouts are Phase 20.

Paymob dashboard setup: Transaction processed callback = `https://<domain>/api/v1/payments/paymob/webhook`; redirection is set per payment.

## Sessions (Phase 17)

Module `src/modules/sessions`, behind a `VideoProvider`: `VIDEO_PROVIDER=daily` (decision 2026-10-10) creates one private Daily room per booking (2 people, open only from 10 min before the start to 15 min after the end, everyone ejected then) and a meeting token per person; `VIDEO_PROVIDER=fake` (local and tests — refused in production) has no video, and the website shows a test room.

| Endpoint                  | Result                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /bookings/:id/join` | the student or the mentor of a `confirmed` booking, while the room is open → `{ provider, url, closesAt }` — `url` is the room address with this person's token (null for the test room). Creates the room on first use; records each side's first join (`meetings.student_joined_at` / `mentor_joined_at`). `409` too early / over / not confirmed |

Bookings carry `session: { opensAt, closesAt, mentorJoined, studentJoined }`. The sweeper (every minute) cancels confirmed sessions whose mentor hasn't joined 15 min after the start — by Sabeq's record or the room's own log (Daily `GET /meetings?room=`) — as a mentor cancellation: full refund through the gateway, both sides notified (`booking.mentor_absent`), no earning.

The website's room is `/sessions/:id` (the call embedded beside the details and the student's questions). `Permissions-Policy` lets `https://*.daily.co` use the camera, microphone and screen share.

## Reviews (Phase 18)

Module `src/modules/reviews`.

| Endpoint                          | Result                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /bookings/:id/review`       | (the booking's student) `{ rating: 1–5, text? ≤ 1000 }` → `201 { review }`. Only a `completed` session, within 30 days of its end, once (unique `reviews.booking_id` — a second try or a race gets `409`). The mentor's `rating_avg` / `rating_count` are recomputed from published reviews in the same transaction, the mentor is notified (`review.created`) and mentor cards refresh |
| `GET /mentors/:slug/reviews?page` | `{ rating, ratingCount, reviews, hasMore }` — published reviews, newest first, 10 a page, reviewer's first name only                                                                                                                                                                                                                                                                    |

Bookings carry `review: { rating, text } | null`. Hiding a review (admin, Phase 20) recomputes the rating the same way.

## Search box (Phase 13)

| Endpoint                 | Result                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /search/suggest?q`  | `{ fields, colleges, mentors }` for search-as-you-type (≤ 3 fields, 4 faculties at universities, 3 mentors)                                                                                                                                                                                 |
| `GET /search/popular`    | `{ terms }` — the week's most searched terms («الأكثر بحثًا الأسبوع ده»)                                                                                                                                                                                                                    |
| `POST /search/log { q }` | a committed search (picked result or Enter) → `{ counted }`. Counted only if the term finds something, once per visitor (hashed IP, kept a day) per term per day; 20 per IP per hour. A term is shown as popular only after 5 different visitors this week. Nothing ties a term to a person |

Recent searches («بحثت مؤخرًا») stay in the visitor's browser (localStorage), never on the server.

## Admin verification (Phase 10)

Admin app only (admin session cookie), module `src/modules/verification`. Reviewers: `verifier` and `super_admin`.

| Endpoint                                       | Body                 | Result                                                                            |
| ---------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `GET /admin/applications?status=&page=`        | —                    | queue (oldest submission first), `counts` per status, `page`; drafts never listed |
| `GET /admin/applications/:id`                  | —                    | application with university / faculty names, documents, history                   |
| `POST /admin/applications/:id/start`           | —                    | `submitted → under_review` (`409` otherwise)                                      |
| `POST /admin/applications/:id/decision`        | `{ decision: approve | reject                                                                            | request_changes, note? }` | note required unless approving; `409` if already decided |
| `GET /admin/applications/:id/documents/:docId` | —                    | decrypted file, `Cache-Control: no-store`, strict CSP; **every view audited**     |
| `GET /admin/audit?entityType=&action=&page=`   | —                    | audit trail, newest first (`super_admin` only)                                    |

- **Approve** creates the mentor profile in the same transaction: kind, faculty, major, graduation year, base price, listed; three offerings (consultation 45 min video, comparison 60 min video, quick call 20 min audio); topics split from the free text. Working hours come in Phase 14.
- Every decision writes an in-app notification for the applicant (shown in Phase 19) and an audit entry with before/after status and the note.
- Decisions are conditional updates: of two reviewers deciding at once, one gets `409`.

## Operations

- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting, finish in-flight requests, exit within 10 s.
- `keepAliveTimeout` 65 s / `headersTimeout` 66 s — longer than load-balancer idle timeouts (avoids 502s).
- Unhandled rejections / exceptions are logged as `fatal` and exit; the orchestrator restarts the container.

## Known limits (tracked)

- Rate limits use an in-memory store — exact per instance. **Phase 21** switches to Redis so the budget is shared across containers.
- OTP codes are logged (console SMS) — a real SMS provider is required before production; config refuses `SMS_PROVIDER=console` there.
- Admin second factor (TOTP) — **Phase 21**.
- **Client IP behind the Next.js rewrite — must be fixed before deploying (Phase 21).** Next's rewrite proxy does not add `X-Forwarded-For`, and it passes a client-sent one through unchanged. With `API_TRUST_PROXY=1` the API therefore sees either the Next server's IP (every visitor looks the same to the per-IP limits) or a value the client chose (per-IP OTP limits can be dodged; per-phone limits still hold). Fix: the Next apps forward the platform-verified client IP in a dedicated header signed with a shared secret, and the API trusts only that.

## Tests

`pnpm --filter @sabeq/api test` — supertest against `createApp()`: envelope, request ids, security headers, CORS, rate limit, validation, malformed and oversized bodies, error sanitization, readiness, config validation.
