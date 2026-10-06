# 0002 — Node 24 LTS, TypeScript 6.0 (pinned)

**Context.** Node 26 is "Current" and Node 24 is LTS. TypeScript 7.0 (the native compiler) is released, but `typescript-eslint` 8.71 supports only `>=4.8.4 <6.1.0`.

**Decision.** Node 24 LTS, pinned in `.nvmrc`, `engines` and the Docker images. TypeScript 6.0.3, exact version. Move to TS 7 once typescript-eslint supports it, in one commit with `pnpm check` green.

**Consequences.** A stable toolchain that does not chase "latest". The upgrade path is tracked here.

**Addendum (2026-10-06).** Next.js pinned to **16.3.8**. 16.4.0 was published the same day; pnpm's minimum-release-age policy blocks packages younger than one day. Upgrade to a 16.4.x patch once it has been out for a while.
