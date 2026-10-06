# @sabeq/config

Shared presets. Every workspace extends these and never redefines them.

| Export                                | Used by                          |
| ------------------------------------- | -------------------------------- |
| `@sabeq/config/tsconfig/base.json`    | everything (strict)              |
| `@sabeq/config/tsconfig/library.json` | `packages/*` compiled to `dist/` |
| `@sabeq/config/tsconfig/node.json`    | `apps/api`                       |
| `@sabeq/config/tsconfig/nextjs.json`  | `apps/web`, `apps/admin`         |
| `@sabeq/config/eslint/base`           | everything                       |
| `@sabeq/config/eslint/node`           | `apps/api`                       |

A React/Next ESLint preset is added in Phase 03.
