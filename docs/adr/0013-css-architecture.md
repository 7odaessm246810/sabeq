# 0013 — CSS architecture

**Context.** The design ships a global, prefixed stylesheet (`sb-` classes) plus page styles, and the UI must match it exactly. React components need to share it across `apps/web` and `apps/admin`.

**Decision.**

- **Tokens** — `@sabeq/tokens` generates `tokens.css` from the handoff `tokens.json` (light only) inside `@layer tokens`.
- **Design system** — `@sabeq/ui/styles.css` is the handoff `bundle.css`, ported as-is (dark rules removed) inside `@layer components`. React components in `@sabeq/ui` render those `sb-` classes; they do not restyle them.
- **App / page styles** — plain global CSS ported from the prototype, **unlayered**, so it sits above the design-system layer in the same order the prototype loaded it. New page-level styles keep the prototype's class names.
- **Fonts** — `next/font/google` (self-hosted, no layout shift); the token variables `--font-display/sans/mono` are re-pointed at the `next/font` variables.
- RTL via logical properties; no Tailwind, no CSS-in-JS runtime.

**Consequences.** Visual parity with the prototype comes from reusing its CSS, not re-implementing it. A change to the design system means updating the ported file, then checking the screens against the screenshots.
