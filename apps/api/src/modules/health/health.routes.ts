import { Router } from 'express';

/** A dependency the API needs to serve traffic (database, Redis …). Resolves when healthy. */
export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

const CHECK_TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Liveness — the process is up (restart it if not).
 * Readiness — every dependency answers (stop sending traffic if not). Checks are registered by the
 * modules that own them: PostgreSQL and Redis arrive in Phase 06.
 */
export function healthRouter(checks: readonly ReadinessCheck[], startedAt: Date): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    const results = await Promise.all(
      checks.map(async (c) => {
        try {
          await withTimeout(c.check(), CHECK_TIMEOUT_MS);
          return [c.name, 'ok'] as const;
        } catch {
          // The reason is logged by the check owner; the probe only reports up/down.
          return [c.name, 'down'] as const;
        }
      }),
    );
    const ok = results.every(([, s]) => s === 'ok');
    res
      .status(ok ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        status: ok ? 'ok' : 'degraded',
        checks: Object.fromEntries(results),
        uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      });
  });

  return router;
}
