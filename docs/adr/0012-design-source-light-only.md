# 0012 — Design handoff is the source of truth; light mode only

**Decision (product owner, 2026-10-06).** The design handoff (`SABEQ-design-handoff/`: prototype, design system, 80 screenshots) and the design-system artifact define the UI. The implementation matches them exactly: spacing, copy, motion and states. Only the **light** theme is implemented; the dark tokens are ignored.

**Consequences.** Visual changes go through the design first, then code. No `data-theme` or dark-mode code paths.
