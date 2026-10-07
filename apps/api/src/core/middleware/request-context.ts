import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

/** A client-supplied id is reused only if it looks safe (no injection into logs or headers). */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function requestId(req: Request): string {
  return String(req.id);
}

/**
 * Gives every request an id (`X-Request-Id`, echoed in error bodies as `requestId`) and logs one line
 * per request with its outcome and duration. Health checks are not logged — load balancers call them
 * every few seconds.
 */
export function requestContext(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
