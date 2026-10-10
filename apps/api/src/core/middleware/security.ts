import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import cors from 'cors';
import type { Request, RequestHandler } from 'express';
import { rateLimit, type Store } from 'express-rate-limit';
import helmet from 'helmet';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Config } from '../../config/env.js';
import { AppError, Errors } from '../errors.js';

/**
 * HTTP security headers. The API only serves JSON, so the strictest CSP applies: nothing may load.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}

/** Set by the web / admin proxies (Phase 21). */
export const CLIENT_IP_HEADER = 'x-sabeq-client-ip';
export const PROXY_SECRET_HEADER = 'x-sabeq-proxy-secret';

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The visitor's real IP, for rate limits, OTP limits and the audit log (Phase 21).
 *
 * Browsers reach the API through the Next.js apps, so the connection comes from the proxy. The proxy
 * sends the visitor's IP in `x-sabeq-client-ip` with the shared `API_PROXY_SECRET`; the API believes
 * it only when the secret matches. Anything else a client sends (`X-Forwarded-For`, our own header
 * without the secret) is ignored, and the address comes from the connection (`trust proxy` hops).
 */
export function clientIp(config: Pick<Config, 'proxySecret'>): RequestHandler {
  return (req, _res, next) => {
    const claimed = req.get(CLIENT_IP_HEADER)?.trim();
    const secret = req.get(PROXY_SECRET_HEADER);
    if (
      claimed &&
      secret &&
      config.proxySecret &&
      sameSecret(secret, config.proxySecret) &&
      isIP(claimed)
    )
      Object.defineProperty(req, 'ip', { value: claimed, configurable: true, enumerable: true });
    next();
  };
}

/**
 * A fixed-window counter in Redis, shared by every API instance. Atomic: INCR, and the window's
 * expiry set only by the first hit.
 */
const HIT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { hits, redis.call('PTTL', KEYS[1]) }`;

export function redisRateStore(
  redis: Redis,
  prefix: string,
  windowMs: number,
  logger?: Logger,
): Store {
  const key = (k: string) => `rl:${prefix}:${k}`;
  return {
    prefix,
    localKeys: false,
    async increment(k) {
      try {
        const [hits, ttl] = (await redis.eval(HIT, 1, key(k), windowMs)) as [number, number];
        return { totalHits: hits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
      } catch (err) {
        // Redis down: let the request through rather than take the whole site down with it.
        logger?.warn({ err }, 'rate limit store unavailable — allowing');
        return { totalHits: 0, resetTime: new Date(Date.now() + windowMs) };
      }
    },
    async decrement(k) {
      await redis.decr(key(k)).catch(() => undefined);
    },
    async resetKey(k) {
      await redis.del(key(k)).catch(() => undefined);
    },
  };
}

/**
 * CORS allowlist (ADR-0004). Requests without an Origin (server-to-server, Next.js server components,
 * health checks) are allowed; browser requests from any other origin are refused with 403.
 */
export function corsPolicy(config: Pick<Config, 'corsOrigins'>): RequestHandler {
  const allowed = new Set(config.corsOrigins);
  return cors({
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) callback(null, true);
      else callback(new AppError('FORBIDDEN', 'الطلب ده مش مسموح من الموقع ده.'));
    },
    credentials: true,
    maxAge: 600,
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  });
}

/**
 * Per-IP request budget for /api/v1 — in Redis when there is one (shared by all API containers),
 * in memory otherwise (a single instance, tests).
 */
export function apiRateLimit(
  config: Pick<Config, 'rateLimit'>,
  redis?: Redis,
  logger?: Logger,
): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(redis ? { store: redisRateStore(redis, 'api', config.rateLimit.windowMs, logger) } : {}),
    handler: (_req, _res, next) => next(Errors.rateLimited()),
  });
}

/**
 * Tighter budgets for actions worth abusing (holding slots, starting payments, reviews, payout
 * details…), per IP per hour, on top of the general one. Matched by method + path.
 */
export const SENSITIVE_LIMITS: readonly {
  name: string;
  method: string;
  path: RegExp;
  perHour: number;
}[] = [
  { name: 'book', method: 'POST', path: /^\/bookings$/, perHour: 30 },
  { name: 'pay', method: 'POST', path: /^\/bookings\/[^/]+\/pay$/, perHour: 30 },
  { name: 'cancel', method: 'POST', path: /^\/bookings\/[^/]+\/cancel$/, perHour: 30 },
  { name: 'review', method: 'POST', path: /^\/bookings\/[^/]+\/review$/, perHour: 20 },
  { name: 'payout-account', method: 'PUT', path: /^\/me\/mentor\/payout-account$/, perHour: 10 },
  { name: 'email', method: 'PUT', path: /^\/me\/email$/, perHour: 10 },
  { name: 'email-verify', method: 'POST', path: /^\/email\/verify$/, perHour: 30 },
  { name: 'upload', method: 'PUT', path: /\/(photo|documents\/[^/]+)$/, perHour: 30 },
];

export function sensitiveRateLimits(redis?: Redis, logger?: Logger): RequestHandler {
  const limiters = SENSITIVE_LIMITS.map((l) => ({
    ...l,
    limiter: rateLimit({
      windowMs: 3_600_000,
      limit: l.perHour,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...(redis ? { store: redisRateStore(redis, l.name, 3_600_000, logger) } : {}),
      handler: (_req, _res, next) =>
        next(Errors.rateLimited('حاولت كتير في وقت قصير. استنى شوية وجرّب تاني.', 600)),
    }),
  }));
  return (req: Request, res, next) => {
    const hit = limiters.find((l) => l.method === req.method && l.path.test(req.path));
    if (!hit) {
      next();
      return;
    }
    void hit.limiter(req, res, next);
  };
}
