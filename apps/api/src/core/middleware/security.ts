import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
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
 * Per-IP request budget for /api/v1. In-memory store: correct for one instance; Phase 21 moves it to
 * Redis so the limit is shared across all API containers.
 */
export function apiRateLimit(config: Pick<Config, 'rateLimit'>): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(Errors.rateLimited()),
  });
}
