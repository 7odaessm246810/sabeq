# Architecture Decision Records

Format: `NNNN-short-title.md` with **Context · Decision · Consequences**.

| #                                             | Decision                                                                     | Status                          |
| --------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| [0001](0001-monorepo-pnpm-turborepo.md)       | Monorepo with pnpm workspaces + Turborepo                                    | Accepted                        |
| [0002](0002-runtime-and-language-versions.md) | Node 24 LTS, TypeScript 6.0 (pinned)                                         | Accepted                        |
| [0003](0003-separate-services.md)             | web, admin, api are separate deployable services                             | Accepted                        |
| [0004](0004-next-to-api-communication.md)     | Next.js apps proxy `/api/v1` to the API (BFF), host-only cookies             | Accepted                        |
| [0005](0005-phone-otp-authentication.md)      | Phone number + OTP authentication                                            | Accepted                        |
| [0006](0006-paymob-payments.md)               | Paymob for payments, confirmed only by webhook                               | Accepted                        |
| [0007](0007-postgresql-prisma-redis.md)       | PostgreSQL + Prisma, Redis                                                   | Accepted                        |
| [0008](0008-one-role-per-account.md)          | One role per account                                                         | Accepted                        |
| [0009](0009-commission-and-payouts.md)        | 10% commission; payouts by bank, InstaPay, Vodafone Cash                     | Accepted                        |
| [0010](0010-money-as-integer-piasters.md)     | Money stored as integer piasters                                             | Accepted                        |
| [0011](0011-sms-provider.md)                  | SMS behind an interface; local Egyptian provider first                       | Proposed — confirm after quotes |
| [0012](0012-design-source-light-only.md)      | Design handoff is the source of truth; light mode only                       | Accepted                        |
| [0013](0013-css-architecture.md)              | Tokens + ported sb- design-system CSS in layers; next/font                   | Accepted                        |
| [0014](0014-deployment-topology.md)           | Next.js apps on Vercel; API as Docker containers (Railway / Render / Fly.io) | Accepted                        |
| [0016](0016-encrypted-document-storage.md)    | Mentor documents in private S3-compatible storage, encrypted by the API      | Accepted                        |
| [0015](0015-opaque-session-cookies.md)        | Opaque server-side sessions in httpOnly cookies                              | Accepted                        |
