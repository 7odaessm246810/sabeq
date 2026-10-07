import { defineConfig } from 'vitest/config';

/** Integration tests that need PostgreSQL — run through scripts/test-db.ts, never by `pnpm test`. */
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
