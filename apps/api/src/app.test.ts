import { type Router } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp, type AppDeps } from './app.js';
import { loadConfig } from './config/env.js';
import { Errors } from './core/errors.js';
import { parseInput, sendData } from './core/http.js';

const silent = pino({ level: 'silent' });

function makeApp(overrides: Partial<AppDeps> = {}, env: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({ NODE_ENV: 'test', ...env });
  return createApp({
    config,
    logger: silent,
    mountV1(v1: Router) {
      const body = z.object({ name: z.string().min(2, 'الاسم قصير'), age: z.number().int() });
      v1.post('/test/echo', (req, res) =>
        sendData(res, parseInput(body, req.body), undefined, 201),
      );
      v1.get('/test/boom', () => {
        throw new Error('database password=hunter2 exploded');
      });
      v1.get('/test/async-boom', async () => {
        await Promise.resolve();
        throw new Error('async failure');
      });
      v1.get('/test/conflict', () => {
        throw Errors.slotUnavailable();
      });
    },
    ...overrides,
  });
}

describe('health', () => {
  it('liveness is always 200 and not cached', async () => {
    const res = await request(makeApp()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('readiness reports every check and turns 503 when one is down', async () => {
    const ok = await request(
      makeApp({ readinessChecks: [{ name: 'db', check: () => Promise.resolve() }] }),
    ).get('/health/ready');
    expect(ok.status).toBe(200);
    expect(ok.body.checks).toEqual({ db: 'ok' });

    const down = await request(
      makeApp({
        readinessChecks: [
          { name: 'db', check: () => Promise.resolve() },
          { name: 'redis', check: () => Promise.reject(new Error('ECONNREFUSED')) },
        ],
      }),
    ).get('/health/ready');
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ status: 'degraded', checks: { db: 'ok', redis: 'down' } });
  });
});

describe('/api/v1', () => {
  it('answers with the success envelope', async () => {
    const res = await request(makeApp()).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { name: 'sabeq-api', version: 'v1' } });
  });

  it('sets a request id and security headers, hides the framework', async () => {
    const res = await request(makeApp()).get('/api/v1');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'",
    );
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('reuses a safe incoming request id and replaces an unsafe one', async () => {
    const app = makeApp();
    const safe = await request(app).get('/api/v1').set('X-Request-Id', 'abc12345-from-proxy');
    expect(safe.headers['x-request-id']).toBe('abc12345-from-proxy');
    const unsafe = await request(app).get('/api/v1').set('X-Request-Id', 'bad id <script>injected');
    expect(unsafe.headers['x-request-id']).not.toContain('injected');
  });
});

describe('errors', () => {
  it('unknown routes return the error envelope with the request id', async () => {
    const res = await request(makeApp()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('validation errors list the failing fields', async () => {
    const res = await request(makeApp()).post('/api/v1/test/echo').send({ name: 'a', age: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toMatchObject({ name: 'الاسم قصير' });
    expect(res.body.error.fields.age).toBeDefined();
  });

  it('valid input passes through', async () => {
    const res = await request(makeApp()).post('/api/v1/test/echo').send({ name: 'ملك', age: 17 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { name: 'ملك', age: 17 } });
  });

  it('malformed JSON is a 400, not a crash', async () => {
    const res = await request(makeApp())
      .post('/api/v1/test/echo')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('oversized bodies are rejected with 413', async () => {
    const res = await request(makeApp({}, { API_BODY_LIMIT: '1kb' }))
      .post('/api/v1/test/echo')
      .send({ name: 'x'.repeat(5000), age: 1 });
    expect(res.status).toBe(413);
  });

  it('unexpected errors never leak details (sync and async)', async () => {
    for (const path of ['/api/v1/test/boom', '/api/v1/test/async-boom']) {
      const res = await request(makeApp()).get(path);
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL');
      expect(JSON.stringify(res.body)).not.toMatch(/password|hunter2|exploded|async failure|stack/);
      expect(res.body.error.message).toContain('ما اتخصمش أي مبلغ');
    }
  });

  it('domain errors keep their code and status', async () => {
    const res = await request(makeApp()).get('/api/v1/test/conflict');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });
});

describe('CORS', () => {
  it('allows listed origins with credentials', async () => {
    const res = await request(makeApp()).get('/api/v1').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refuses other browser origins', async () => {
    const res = await request(makeApp()).get('/api/v1').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests without an Origin (server-to-server)', async () => {
    expect((await request(makeApp()).get('/api/v1')).status).toBe(200);
  });
});

describe('rate limit', () => {
  it('returns 429 with the envelope once the budget is spent', async () => {
    const app = makeApp({}, { API_RATE_LIMIT_MAX: '2' });
    await request(app).get('/api/v1').expect(200);
    const second = await request(app).get('/api/v1').expect(200);
    expect(second.headers.ratelimit).toBeDefined();
    const third = await request(app).get('/api/v1');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not count health checks', async () => {
    const app = makeApp({}, { API_RATE_LIMIT_MAX: '1' });
    for (let i = 0; i < 5; i++) await request(app).get('/health/live').expect(200);
    await request(app).get('/api/v1').expect(200);
  });
});
