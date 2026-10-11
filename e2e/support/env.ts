/** Where the running stack is. Locally the root `.env` (compose ports); in CI the env. */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:3001';
export const API = process.env.E2E_API_URL ?? 'http://localhost:4000';

const pg = {
  user: process.env.POSTGRES_USER ?? 'sabeq',
  password: process.env.POSTGRES_PASSWORD ?? 'sabeq',
  db: process.env.POSTGRES_DB ?? 'sabeq',
  port: process.env.POSTGRES_HOST_PORT ?? '5432',
};
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  `postgresql://${pg.user}:${pg.password}@localhost:${pg.port}/${pg.db}`;
export const REDIS_URL =
  process.env.E2E_REDIS_URL ?? `redis://localhost:${process.env.REDIS_HOST_PORT ?? '6379'}`;
