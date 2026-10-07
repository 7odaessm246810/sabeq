/**
 * Redis: OTP codes (Phase 07), slot holds (Phase 15), queues (Phase 19), shared rate limits (Phase 21).
 */
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { ReadinessCheck } from '../modules/health/health.routes.js';

export function createRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url, {
    // Fail fast instead of queueing commands forever while Redis is down.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    lazyConnect: false,
  });
  let lastError = '';
  redis.on('error', (err: Error) => {
    // ioredis retries on its own; log each distinct failure once instead of every retry.
    if (err.message !== lastError) {
      lastError = err.message;
      logger.error({ err }, 'redis error');
    }
  });
  redis.on('ready', () => {
    lastError = '';
    logger.info('redis ready');
  });
  return redis;
}

export function redisReadiness(redis: Redis): ReadinessCheck {
  return {
    name: 'redis',
    async check() {
      const pong = await redis.ping();
      if (pong !== 'PONG') throw new Error(`unexpected PING reply: ${pong}`);
    },
  };
}
