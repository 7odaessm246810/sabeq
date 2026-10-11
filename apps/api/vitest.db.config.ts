import { defineConfig } from 'vitest/config';

/**
 * Everything, including the integration tests that need PostgreSQL — run through
 * scripts/test-db.ts, never by `pnpm test` (unit tests only). `pnpm test:coverage` adds coverage.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.test.ts', 'src/testing/**', 'src/server.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Measured 2026-10-11 (Phase 22): lines 92%, statements 89%, branches 75%. Don't slide back.
      thresholds: { lines: 90, statements: 86, functions: 90, branches: 72 },
    },
  },
});
