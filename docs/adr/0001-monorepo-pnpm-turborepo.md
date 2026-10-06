# 0001 — Monorepo with pnpm workspaces + Turborepo

**Context.** Three apps (web, admin, api) share types, utilities, design tokens and components. Separate repositories would let these contracts drift apart.

**Decision.** One repository. pnpm workspaces (strict, fast, disk-efficient, with a version `catalog:` so each dependency has one version). Turborepo for task ordering and caching (`build → lint/typecheck/test`).

**Consequences.** One PR can change the API and its consumers together. Each app still builds and deploys on its own. CI can build only what changed (`turbo --filter`).
