# SABEQ — Environments

| Environment  | Purpose                                                 | Web                | Admin                    | API                    | Data                                            |
| ------------ | ------------------------------------------------------- | ------------------ | ------------------------ | ---------------------- | ----------------------------------------------- |
| `local`      | developer machine (Docker Compose from Phase 02)        | `localhost:3000`   | `localhost:3001`         | `localhost:4000`       | local Postgres/Redis containers, fake providers |
| `staging`    | test every change before production, same setup as prod | `staging.<domain>` | `admin.staging.<domain>` | `api.staging.<domain>` | separate DB, provider **sandbox/test** keys     |
| `production` | real users and real money                               | `<domain>`         | `admin.<domain>`         | `api.<domain>`         | managed DB with backups, live keys              |

`APP_ENV` says which environment we are in; `NODE_ENV` only says how the code is built (`development`/`production`/`test`).

## Rules

1. `.env.example` lists **every** variable with a comment. Adding a variable = updating `.env.example` in the same commit.
2. Real values live only in `.env` (git-ignored) locally, and in the hosting provider's secret store in staging/production.
3. Only `apps/api` reads secrets. Anything prefixed `NEXT_PUBLIC_` is shipped to browsers — never put a secret there.
4. Next.js build-time values (`NEXT_PUBLIC_*`, `API_INTERNAL_URL`, `APP_ENV`) are baked into the image — see [docker.md](docker.md).
5. The API validates all variables with zod at startup and **refuses to start** if one is missing or invalid.
6. Staging and production never share keys, databases or buckets.
7. Local providers default to `console` (OTP codes and emails are printed to the API log, nothing is sent).

## Variable groups

See `.env.example` — grouped by app and by the phase that introduces them (database → Phase 06, auth/SMS → 07, storage → 09, Paymob → 16, email → 19, video → 17).
