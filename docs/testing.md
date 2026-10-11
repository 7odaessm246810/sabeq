# Testing

Three layers, all run by CI on every push (`.github/workflows/ci.yml`). Phase 22, 2026-10-11.

| Layer       | What                                                                                                                                                                                                         | Where                                                                                           | Run                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unit        | rules and pure logic: refunds, slots, money, Arabic search, Cairo time, HMAC, gateways (mocked network), email rendering; UI components in jsdom (Modal focus, Escape, Tab)                                  | `*.test.ts(x)` next to the code — `packages/utils`, `packages/types`, `packages/ui`, `apps/api` | `pnpm test` (part of `pnpm check`)                                                                              |
| Integration | every API route against a real PostgreSQL, Redis and S3: auth, catalog, mentors, scheduling, bookings, payments (fake gateway, signed callbacks), sessions, reviews, notifications, admin, payouts, security | `apps/api/src/**/*.db.test.ts`                                                                  | `pnpm test:db` (needs `docker compose up -d postgres redis storage`) · `pnpm --filter @sabeq/api test:coverage` |
| End to end  | real journeys in Chrome against the running stack, desktop and phone, with axe (WCAG 2.1 AA: no serious / critical issue) and a guard that fails on any page error, CSP block or API 5xx                     | `e2e/tests/*.spec.ts`                                                                           | `pnpm test:e2e` (needs the whole stack: `docker compose up -d`)                                                 |

## The journeys

| Journey | Covers                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| visitor | home search suggestions → faculty; explore filters → a faculty page; mentors list → profile; signed-out redirect |
| student | sign up → book → card refused → pay by wallet → «جلساتي» → cancel (refund)                                       |
| session | room opens before the start → student and mentor come in → mentor completes → student rates (review is live)     |
| mentor  | new booking rings the bell → «جلساتي» with the earning → payout method (masked) → weekly hours, notifications    |
| admin   | overview → full refund of a booking → suspend an account (signed out at once) → payout to a mentor → audit log   |
| mobile  | no sideways scrolling, the menu, booking and paying on a Pixel 7                                                 |

Journeys create their own users (fresh 015 numbers, the OTP read from the local-development hint) and their own mentor directly in the database (`e2e/support/db.ts`), so they never depend on demo data or on each other. They clear the per-IP limits in Redis before starting. They can only run where the OTP hint exists — local development and CI; against a real SMS provider they stop at sign-in.

## Coverage

API (unit + integration, 2026-10-11): lines 93%, statements 90%, functions 93%, branches 76%. CI fails under 90 / 86 / 90 / 72. The report is uploaded as the `api-coverage` artifact; locally `apps/api/coverage/index.html`.

## What testing found (Phase 22)

- Accessibility: hero mentor cards were buttons holding links; the «كيف تعمل؟» steps list held a non-item; the search listbox was announced while empty; time-slot buttons carried a conflicting state; «مواعيدي» time pickers had no names.
- The notification for a new review opened «جلساتي» on the wrong tab.
- Admin: the danger buttons' label was red on red; "nothing yet" notes were struck through.
- (Phase 20) Typing in any dialog lost focus after one letter — now a unit test and a journey step type key by key.

## Writing a test

- A rule or a pure function → a unit test beside it.
- A route, a database rule or anything with money → an integration test (`*.db.test.ts`) with `createHarness()`.
- Something a person does across pages → a journey; prefer roles and visible Arabic text (`getByRole`, `getByLabel`) over CSS selectors, and `pressSequentially` for typing.
