/**
 * Fixed-window counters in Redis, shared by every API container (unlike the in-memory per-IP limit
 * on /api/v1). Used where abuse costs money or security: OTP sends cost an SMS each, and OTP
 * verification is a 6-digit guess.
 */
import type { Redis } from 'ioredis';

export interface WindowResult {
  allowed: boolean;
  /** Seconds until the window resets (meaningful when `allowed` is false). */
  retryAfter: number;
}

// INCR and set the expiry on the first hit, atomically, so a crash never leaves a key without TTL.
const HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { n, redis.call('TTL', KEYS[1]) }
`;

export async function hitWindow(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<WindowResult> {
  const [count, ttl] = (await redis.eval(HIT, 1, key, windowSeconds)) as [number, number];
  return { allowed: count <= limit, retryAfter: ttl > 0 ? ttl : windowSeconds };
}
