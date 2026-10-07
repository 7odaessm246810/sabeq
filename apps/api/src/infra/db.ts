/**
 * PostgreSQL access through Prisma's pg driver adapter (Prisma 7).
 * One client per process; the pool size bounds connections per API container — with N containers the
 * database sees N × POOL_MAX connections, so on Neon DATABASE_URL must point at the pooler host.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import type { Logger } from 'pino';
import { PrismaClient } from '../generated/prisma/client.js';
import type { ReadinessCheck } from '../modules/health/health.routes.js';

export type Db = PrismaClient;

export interface DbOptions {
  url: string;
  poolMax: number;
  logger: Logger;
}

export function createDb({ url, poolMax, logger }: DbOptions): Db {
  const adapter = new PrismaPg({
    connectionString: url,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Fail slow queries instead of piling them up under load.
    statement_timeout: 10_000,
  });
  const db = new PrismaClient({
    adapter,
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });
  db.$on('warn', (e) => logger.warn({ target: e.target }, e.message));
  db.$on('error', (e) => logger.error({ target: e.target }, e.message));
  return db;
}

export function dbReadiness(db: Db, logger: Logger): ReadinessCheck {
  return {
    name: 'database',
    async check() {
      try {
        await db.$queryRaw`SELECT 1`;
      } catch (err) {
        logger.error({ err }, 'database readiness check failed');
        throw err;
      }
    },
  };
}
