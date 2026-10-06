# @sabeq/tokens

`src/tokens.json` is copied from the design handoff (`design-system/tokens.json`) — that file is the source of truth.
`pnpm build` writes `dist/tokens.css`: every token as a CSS variable on `:root`, **light theme only**, inside `@layer tokens`.

```css
@import '@sabeq/tokens/tokens.css';
.card {
  padding: var(--space-5);
  border-radius: var(--radius-md);
}
```

When the design changes: replace `src/tokens.json`, run `pnpm --filter @sabeq/tokens build test`.
