/** The Redis rate-limit store (Phase 21): one count shared by every API instance. */
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { redisRateStore } from './security.js';

const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
url.pathname = '/15';
const redis = new Redis(url.toString(), { maxRetriesPerRequest: 2 });
afterAll(() => redis.quit());

describe('redisRateStore', () => {
  it('counts across instances, expires with the window, and resets', async () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    const a = redisRateStore(redis, 'unit', 2_000);
    const b = redisRateStore(redis, 'unit', 2_000); // another API container

    expect((await a.increment(key)).totalHits).toBe(1);
    expect((await b.increment(key)).totalHits).toBe(2);
    const third = await a.increment(key);
    expect(third.totalHits).toBe(3);
    expect((third.resetTime?.getTime() ?? 0) - Date.now()).toBeLessThanOrEqual(2_000);
    expect(await redis.pttl(`rl:unit:${key}`)).toBeGreaterThan(0);

    await a.decrement(key);
    expect((await b.increment(key)).totalHits).toBe(3);
    await a.resetKey(key);
    expect((await b.increment(key)).totalHits).toBe(1);
  });

  it('lets requests through when Redis is unreachable', async () => {
    const down = new Redis('redis://localhost:1', {
      maxRetriesPerRequest: 0,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    const store = redisRateStore(down, 'unit', 1_000);
    expect((await store.increment('x')).totalHits).toBe(0);
    down.disconnect();
  });
});
