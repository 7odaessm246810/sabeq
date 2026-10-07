/**
 * The only place that reads `process.env` (docs/conventions.md). Everything is validated with zod at
 * startup; an invalid or missing value stops the process with a readable list of problems
 * (docs/environments.md → rule 5).
 */
import { z } from 'zod';

const csv = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url({ message: 'must be a comma-separated list of URLs' })));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Browser origins allowed to call the API directly (the Next apps normally proxy — ADR-0004). */
    CORS_ORIGINS: csv.default(['http://localhost:3000', 'http://localhost:3001']),
    /** Number of reverse proxies in front of the API; needed for correct client IPs (rate limits). */
    API_TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    /** Requests per client IP per window on /api/v1. */
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, message: 'must be a postgresql:// URL' }),
    /** Connections per API container (N containers × this ≤ what the database / pooler allows). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    REDIS_URL: z.url({ protocol: /^rediss?$/, message: 'must be a redis:// or rediss:// URL' }),
    API_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/, 'e.g. 100kb or 1mb')
      .default('100kb'),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'production') {
      for (const origin of env.CORS_ORIGINS) {
        if (!origin.startsWith('https://')) {
          ctx.addIssue({
            code: 'custom',
            path: ['CORS_ORIGINS'],
            message: `production origins must use https (got ${origin})`,
          });
        }
      }
      if (env.NODE_ENV !== 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['NODE_ENV'],
          message: 'must be "production" when APP_ENV is production',
        });
      }
    }
  });

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  appEnv: 'local' | 'staging' | 'production';
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  corsOrigins: readonly string[];
  trustProxy: number;
  rateLimit: { windowMs: number; max: number };
  bodyLimit: string;
  databaseUrl: string;
  databasePoolMax: number;
  redisUrl: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Parses the environment. Throws `ConfigError` listing every invalid variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new ConfigError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    appEnv: e.APP_ENV,
    port: e.API_PORT,
    logLevel: e.LOG_LEVEL,
    corsOrigins: e.CORS_ORIGINS,
    trustProxy: e.API_TRUST_PROXY,
    rateLimit: { windowMs: e.API_RATE_LIMIT_WINDOW_MS, max: e.API_RATE_LIMIT_MAX },
    bodyLimit: e.API_BODY_LIMIT,
    databaseUrl: e.DATABASE_URL,
    databasePoolMax: e.DATABASE_POOL_MAX,
    redisUrl: e.REDIS_URL,
  };
}
