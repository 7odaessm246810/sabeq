import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests only; *.db.test.ts need PostgreSQL and run through `pnpm test:db`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
  },
});
