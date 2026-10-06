# SABEQ — Development workflow

## Requirements

- Node **24 LTS** (`.nvmrc`), pnpm **11** (`packageManager` in `package.json`), Git.
- Docker Desktop with WSL 2 — see [docker.md](docker.md).
- VS Code with the recommended extensions (`.vscode/extensions.json`).

## Everyday commands (from the repo root)

| Command                                      | What it does                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm install`                               | install all workspaces                                                    |
| `pnpm dev`                                   | run every app in watch mode                                               |
| `pnpm build`                                 | build everything in dependency order (Turborepo, cached)                  |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | per-workspace checks                                                      |
| `pnpm check`                                 | format check + lint + typecheck + test — **must pass before every merge** |
| `pnpm format`                                | format the whole repo                                                     |
| `pnpm --filter @sabeq/utils test`            | run one workspace                                                         |

## Dependencies

- Shared versions live in the `catalog:` section of `pnpm-workspace.yaml`. Workspaces write `"zod": "catalog:"`, never a version.
- Exact versions only. Upgrades are deliberate commits (`chore(deps): …`), checked with `pnpm check`.

## Git

- `main` is always deployable. Protected: no direct pushes once the remote exists.
- Branches: `phase/01-foundation`, `feat/booking-slot-hold`, `fix/otp-expiry`, `chore/…`.
- Commits follow **Conventional Commits** with a scope (enforced by commitlint):
  `feat(api): add slot hold`, `fix(web): RTL arrow direction`, `docs(repo): add ADR-0011`.
  Scopes: `web admin api ui tokens types utils config docker docs repo deps`.
- Pre-commit hook: Prettier + ESLint on staged files. Commit-msg hook: commitlint.
- Pull request per phase (or per feature inside a phase), with the phase checklist in the description.

## Phase workflow

Each phase in `docs/ROADMAP.md` goes:
**Goal → Requirements → Architecture → Files → Implementation → Testing → Checklist → Handoff → review → next phase.**
A phase is "done" only when `pnpm check` is green and the checklist is reviewed.

## Decisions

Any decision that is hard to reverse gets an ADR in `docs/adr/` (`NNNN-short-title.md`: Context · Decision · Consequences).
