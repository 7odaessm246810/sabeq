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

/** Empty variables (`KEY=` in .env) count as unset. */
const unsetIfEmpty = (v: unknown) => (v === '' ? undefined : v);

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
    /** HMAC key for OTP codes at rest (Redis). One per environment, never shared. */
    AUTH_OTP_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Where OTP codes go. `console` logs them — never allowed in production. */
    SMS_PROVIDER: z.enum(['console']).default('console'),
    /** S3-compatible object storage (AWS S3, Cloudflare R2, or the local gateway in Docker). */
    STORAGE_ENDPOINT: z.url().optional(),
    STORAGE_REGION: z.string().min(1).default('auto'),
    STORAGE_BUCKET_PRIVATE: z.string().min(3).max(63),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    /** Path-style URLs (`endpoint/bucket/key`) — needed by local gateways; R2 accepts both. */
    STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /**
     * Keys for encrypting mentor documents (AES-256-GCM), `id:base64key` comma-separated. Old keys stay
     * listed so existing files can still be read after rotation; new files use the active one.
     */
    DOCUMENTS_ENCRYPTION_KEYS: z.string().transform((raw, ctx) => {
      const keys = new Map<string, Buffer>();
      for (const part of raw
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)) {
        const [id, b64] = part.split(':');
        const key = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
        if (!id || !/^[a-z0-9-]{1,40}$/.test(id) || key.length !== 32) {
          ctx.addIssue({ code: 'custom', message: 'each entry must be id:base64(32 bytes)' });
          return z.NEVER;
        }
        keys.set(id, key);
      }
      if (!keys.size) {
        ctx.addIssue({ code: 'custom', message: 'at least one key is required' });
        return z.NEVER;
      }
      return keys;
    }),
    DOCUMENTS_ENCRYPTION_ACTIVE_KEY: z.string().min(1),
    /** The website origin people use — payment return links and Paymob callbacks go through it. */
    API_PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
    /** "fake": a local test checkout (never in production). "paymob": real payments. */
    PAYMOB_MODE: z.preprocess(unsetIfEmpty, z.enum(['fake', 'paymob']).default('fake')),
    PAYMOB_API_BASE: z.url().default('https://accept.paymob.com'),
    PAYMOB_SECRET_KEY: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    PAYMOB_PUBLIC_KEY: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    PAYMOB_HMAC_SECRET: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    /** Integration ids from the Paymob dashboard, one per method (kiosk = Aman / Masary). */
    PAYMOB_INTEGRATION_CARD: z.preprocess(
      unsetIfEmpty,
      z.coerce.number().int().positive().optional(),
    ),
    PAYMOB_INTEGRATION_WALLET: z.preprocess(
      unsetIfEmpty,
      z.coerce.number().int().positive().optional(),
    ),
    PAYMOB_INTEGRATION_KIOSK: z.preprocess(
      unsetIfEmpty,
      z.coerce.number().int().positive().optional(),
    ),
    /** "fake": a local test room (never in production). "daily": Daily.co video rooms. */
    VIDEO_PROVIDER: z.preprocess(unsetIfEmpty, z.enum(['fake', 'daily']).default('fake')),
    DAILY_API_BASE: z.url().default('https://api.daily.co/v1'),
    DAILY_API_KEY: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    API_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/, 'e.g. 100kb or 1mb')
      .default('100kb'),
  })
  .superRefine((env, ctx) => {
    if (!env.DOCUMENTS_ENCRYPTION_KEYS.has(env.DOCUMENTS_ENCRYPTION_ACTIVE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCUMENTS_ENCRYPTION_ACTIVE_KEY'],
        message: 'must be one of the ids in DOCUMENTS_ENCRYPTION_KEYS',
      });
    }
    if (env.PAYMOB_MODE === 'paymob') {
      for (const key of ['PAYMOB_SECRET_KEY', 'PAYMOB_PUBLIC_KEY', 'PAYMOB_HMAC_SECRET'] as const)
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when PAYMOB_MODE=paymob',
          });
      if (!env.PAYMOB_INTEGRATION_CARD && !env.PAYMOB_INTEGRATION_WALLET)
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMOB_INTEGRATION_CARD'],
          message: 'set at least one integration id (card or wallet)',
        });
    }
    if (env.VIDEO_PROVIDER === 'daily' && !env.DAILY_API_KEY)
      ctx.addIssue({
        code: 'custom',
        path: ['DAILY_API_KEY'],
        message: 'required when VIDEO_PROVIDER=daily',
      });
    if (env.APP_ENV === 'production' && env.VIDEO_PROVIDER !== 'daily')
      ctx.addIssue({
        code: 'custom',
        path: ['VIDEO_PROVIDER'],
        message: 'production holds real sessions: set VIDEO_PROVIDER=daily',
      });
    if (env.APP_ENV === 'production' && env.PAYMOB_MODE !== 'paymob')
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMOB_MODE'],
        message: 'production takes real payments: set PAYMOB_MODE=paymob',
      });
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
      if (env.SMS_PROVIDER === 'console') {
        ctx.addIssue({
          code: 'custom',
          path: ['SMS_PROVIDER'],
          message: 'production needs a real SMS provider (console only logs codes)',
        });
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
  storage: {
    endpoint: string | undefined;
    region: string;
    privateBucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
  documentKeys: { active: string; keys: ReadonlyMap<string, Buffer> };
  auth: {
    otpSecret: string;
    smsProvider: 'console';
    /** Secure + `__Host-` cookies everywhere except plain-http local development. */
    secureCookies: boolean;
  };
  publicWebUrl: string;
  payments: {
    mode: 'fake' | 'paymob';
    apiBase: string;
    secretKey: string | undefined;
    publicKey: string | undefined;
    hmacSecret: string | undefined;
    integrations: { card?: number; wallet?: number; kiosk?: number };
  };
  video: {
    provider: 'fake' | 'daily';
    apiBase: string;
    apiKey: string | undefined;
  };
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
    storage: {
      endpoint: e.STORAGE_ENDPOINT,
      region: e.STORAGE_REGION,
      privateBucket: e.STORAGE_BUCKET_PRIVATE,
      accessKeyId: e.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: e.STORAGE_FORCE_PATH_STYLE,
    },
    documentKeys: { active: e.DOCUMENTS_ENCRYPTION_ACTIVE_KEY, keys: e.DOCUMENTS_ENCRYPTION_KEYS },
    auth: {
      otpSecret: e.AUTH_OTP_SECRET,
      smsProvider: e.SMS_PROVIDER,
      secureCookies: e.APP_ENV !== 'local',
    },
    publicWebUrl: e.API_PUBLIC_WEB_URL.replace(/\/$/, ''),
    payments: {
      mode: e.PAYMOB_MODE,
      apiBase: e.PAYMOB_API_BASE.replace(/\/$/, ''),
      secretKey: e.PAYMOB_SECRET_KEY,
      publicKey: e.PAYMOB_PUBLIC_KEY,
      hmacSecret: e.PAYMOB_HMAC_SECRET,
      integrations: {
        ...(e.PAYMOB_INTEGRATION_CARD ? { card: e.PAYMOB_INTEGRATION_CARD } : {}),
        ...(e.PAYMOB_INTEGRATION_WALLET ? { wallet: e.PAYMOB_INTEGRATION_WALLET } : {}),
        ...(e.PAYMOB_INTEGRATION_KIOSK ? { kiosk: e.PAYMOB_INTEGRATION_KIOSK } : {}),
      },
    },
    video: {
      provider: e.VIDEO_PROVIDER,
      apiBase: e.DAILY_API_BASE.replace(/\/$/, ''),
      apiKey: e.DAILY_API_KEY,
    },
  };
}
