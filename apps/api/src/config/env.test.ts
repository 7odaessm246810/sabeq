import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '../testing/env.js';
import { ConfigError, loadConfig } from './env.js';

const BASE = {
  ...TEST_ENV,
  NODE_ENV: undefined, // the defaults are what is tested here
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('uses safe local defaults', () => {
    const c = loadConfig(BASE);
    expect(c).toMatchObject({
      nodeEnv: 'development',
      appEnv: 'local',
      port: 4000,
      corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
      rateLimit: { windowMs: 60_000, max: 300 },
    });
  });

  it('parses numbers and comma lists', () => {
    const c = loadConfig({
      ...BASE,
      API_PORT: '8080',
      CORS_ORIGINS: 'https://a.example, https://b.example',
    });
    expect(c.port).toBe(8080);
    expect(c.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('lists every invalid variable at once', () => {
    try {
      loadConfig({ ...BASE, API_PORT: 'abc', LOG_LEVEL: 'loud', CORS_ORIGINS: 'not a url' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as Error).message;
      expect(msg).toContain('API_PORT');
      expect(msg).toContain('LOG_LEVEL');
      expect(msg).toContain('CORS_ORIGINS');
    }
  });

  it('production demands https origins and a production build', () => {
    expect(() =>
      loadConfig({
        ...BASE,
        APP_ENV: 'production',
        NODE_ENV: 'development',
        CORS_ORIGINS: 'http://sabeq.example',
      }),
    ).toThrow(/https[\s\S]*NODE_ENV|NODE_ENV[\s\S]*https/);
    // Until a real SMS provider exists, production refuses to start rather than log OTP codes.
    expect(() =>
      loadConfig({
        ...BASE,
        APP_ENV: 'production',
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://sabeq.example',
      }),
    ).toThrow(/SMS_PROVIDER/);
  });

  it('requires a long OTP secret and uses secure cookies outside local', () => {
    expect(() => loadConfig({ ...BASE, AUTH_OTP_SECRET: 'short' })).toThrow(/AUTH_OTP_SECRET/);
    expect(loadConfig(BASE).auth.secureCookies).toBe(false);
    expect(loadConfig({ ...BASE, APP_ENV: 'staging' }).auth.secureCookies).toBe(true);
  });

  it('requires the database and Redis URLs', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
    expect(() => loadConfig({ ...BASE, DATABASE_URL: 'mysql://x@y/z' })).toThrow(/postgresql/);
  });
});
