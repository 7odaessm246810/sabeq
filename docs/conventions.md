# SABEQ — Conventions

## Naming

| Thing                        | Convention                                                    | Example                                     |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| Folders, non-component files | `kebab-case`                                                  | `mentor-card/`, `slot-hold.ts`              |
| React component files        | `PascalCase.tsx`                                              | `MentorCard.tsx`                            |
| Hooks                        | `useCamelCase.ts`                                             | `useBookingDraft.ts`                        |
| Backend module files         | `<module>.<layer>.ts`                                         | `bookings.service.ts`, `bookings.routes.ts` |
| Tests                        | next to the file, `.test.ts(x)`                               | `money.test.ts`                             |
| Types / interfaces           | `PascalCase`, no `I` prefix                                   | `BookingStatus`                             |
| Constants                    | `UPPER_SNAKE_CASE`                                            | `BOOKING_STATUSES`                          |
| Variables / functions        | `camelCase`, verbs for functions                              | `splitCommission()`                         |
| Env variables                | `UPPER_SNAKE_CASE`, browser-visible start with `NEXT_PUBLIC_` | `API_INTERNAL_URL`                          |
| Packages                     | `@sabeq/<name>`                                               | `@sabeq/utils`                              |
| CSS classes (design system)  | `sb-` prefix, BEM-ish modifiers                               | `sb-btn sb-btn--primary`                    |
| DB tables / columns          | `snake_case`, plural tables (Prisma `@@map`)                  | `mentor_applications.created_at`            |
| Enum values (DB + API)       | `snake_case` strings                                          | `under_review`, `no_show`                   |

## TypeScript

- `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` everywhere (`packages/config/tsconfig/base.json`).
- No `any`. Use `unknown` and narrow it.
- Type-only imports use `import { type X }`.
- ESM everywhere (`"type": "module"`); relative imports in packages end with `.js`.
- Validate every external input (HTTP body, query, env, webhook) with **zod** at the boundary; inside the boundary, trust the types.

## API

- Base path `/api/v1`. Breaking changes → `/api/v2`, never silent.
- Resources are plural nouns: `GET /api/v1/mentors/:id`, `POST /api/v1/bookings`.
- Actions that are not CRUD use a sub-resource verb: `POST /api/v1/bookings/:id/cancel`.
- JSON fields `camelCase`. Dates ISO-8601 UTC strings. Money as integer piasters + `currency`.
- Response envelope and error codes: `packages/types/src/api.ts`.
- Lists use cursor pagination: `?limit=20&cursor=...` → `meta.nextCursor`.
- Every response carries `X-Request-Id`; errors include it as `requestId`.
- Error messages are safe Arabic text for users. No stack traces, SQL or provider errors in responses.
- Idempotency: `POST` endpoints that create money-related records accept an `Idempotency-Key` header.

## Frontend

- Server Components by default; `'use client'` only where interaction needs it.
- Design system first: never re-style a button or card inline — use or extend `@sabeq/ui`.
- Use design tokens (CSS variables) only; no raw hex values in components.
- RTL first: use logical properties (`margin-inline-start`, `inset-inline-end`), never `left/right` for layout.
- Every data view ships with Loading (skeleton), Empty and Error states.
- Copy follows the design voice: polite Egyptian Arabic, «انت», errors say what happened + whether money was affected + what to do.

## Code style

- Prettier formats; ESLint catches bugs. Both run on commit (husky + lint-staged).
- No `console.*` in app code — use the logger (Phase 05).
- Comments explain _why_, not _what_.
