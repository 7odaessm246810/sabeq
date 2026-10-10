/**
 * Builds the Express application. No `listen` here — server.ts owns the process, tests call
 * `createApp()` directly. Order matters: context → security → parsing → routes → 404 → errors.
 */
import { PLATFORM } from '@sabeq/types';
import express, { Router, type Express } from 'express';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Config } from './config/env.js';
import { sendData } from './core/http.js';
import { errorHandler, notFound } from './core/middleware/errors.js';
import { requestContext } from './core/middleware/request-context.js';
import {
  apiRateLimit,
  clientIp,
  corsPolicy,
  securityHeaders,
  sensitiveRateLimits,
} from './core/middleware/security.js';
import { healthRouter, type ReadinessCheck } from './modules/health/health.routes.js';

export interface AppDeps {
  config: Config;
  logger: Logger;
  readinessChecks?: readonly ReadinessCheck[];
  /** Rate limits shared by every API instance (Phase 21); in memory without it. */
  redis?: Redis;
  /** Feature modules mount their routers on /api/v1 here. */
  mountV1?: (v1: Router) => void;
  startedAt?: Date;
}

export function createApp({
  config,
  logger,
  readinessChecks = [],
  redis,
  mountV1,
  startedAt = new Date(),
}: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind N proxies (load balancer, Next.js rewrite) req.ip must be the real client for rate limits.
  app.set('trust proxy', config.trustProxy);
  app.set('etag', false);

  // The visitor's real IP first: logs, rate limits and audits all read req.ip.
  app.use(clientIp(config));
  app.use(requestContext(logger));
  app.use(securityHeaders());
  app.use('/health', healthRouter(readinessChecks, startedAt));

  const v1 = Router();
  v1.use(corsPolicy(config));
  v1.use(apiRateLimit(config, redis, logger));
  v1.use(sensitiveRateLimits(redis, logger));
  v1.use(express.json({ limit: config.bodyLimit }));
  v1.get('/', (_req, res) => {
    sendData(res, { name: 'sabeq-api', version: PLATFORM.apiVersion });
  });
  mountV1?.(v1);

  app.use(`/api/${PLATFORM.apiVersion}`, v1);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
