/**
 * Before the journeys: the stack must be up, and the per-IP limits must not carry over from a
 * previous run (every journey signs in from the same address). Local / CI Redis only.
 */
import { Redis } from 'ioredis';
import { ADMIN, API, REDIS_URL, WEB } from './env.js';

export default async function globalSetup() {
  for (const [name, url] of [
    ['api', `${API}/health/ready`],
    ['web', `${WEB}/login`],
    ['admin', `${ADMIN}/login`],
  ] as const) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok)
      throw new Error(`${name} is not up at ${url} — start the stack (docker compose up)`);
  }

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
  for (const pattern of ['auth:*:ip:*', 'auth:login:fail:*', 'rl:*'] as const) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }
  await redis.quit();
}
