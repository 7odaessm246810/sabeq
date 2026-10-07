/**
 * Prisma CLI configuration (migrate, generate, seed). The running API does not read this file —
 * it connects through the pg driver adapter with DATABASE_URL (src/infra/db.ts).
 *
 * Migrations need a direct (non-pooled) connection: on Neon that is the host without "-pooler".
 * Locally both URLs point at the Docker database.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Local development keeps one .env at the repo root; in CI/containers the variables are already set.
const rootEnv = path.join(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// `prisma generate` needs no database (image builds have no URL); migrate/seed fail without one.
const url = process.env.DATABASE_DIRECT_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(url ? { datasource: { url } } : {}),
});
