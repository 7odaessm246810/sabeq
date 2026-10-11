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

  it('production sends real emails; Resend needs its key', () => {
    expect(() => loadConfig({ ...BASE, APP_ENV: 'production' })).toThrow(/EMAIL_PROVIDER/);
    expect(() => loadConfig({ ...BASE, EMAIL_PROVIDER: 'resend' })).toThrow(/EMAIL_API_KEY/);
    expect(loadConfig(BASE).email.provider).toBe('console');
  });

  it('production refuses the test video room; Daily needs its key', () => {
    expect(() => loadConfig({ ...BASE, APP_ENV: 'production' })).toThrow(/VIDEO_PROVIDER/);
    expect(() => loadConfig({ ...BASE, VIDEO_PROVIDER: 'daily' })).toThrow(/DAILY_API_KEY/);
    expect(loadConfig({ ...BASE, VIDEO_PROVIDER: 'daily', DAILY_API_KEY: 'k' }).video).toEqual({
      provider: 'daily',
      apiBase: 'https://api.daily.co/v1',
      apiKey: 'k',
    });
    expect(loadConfig({ ...BASE, VIDEO_PROVIDER: '' }).video.provider).toBe('fake');
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

describe('connection URLs pasted from a dashboard', () => {
  it('tolerates spaces, quotes and a pasted redis-cli command', () => {
    for (const REDIS_URL of [
      '  rediss://default:pw@x.upstash.io:6379  ',
      '"rediss://default:pw@x.upstash.io:6379"',
      'redis-cli --tls -u rediss://default:pw@x.upstash.io:6379',
      // Upstash's snippet: TLS in the flag, redis:// in the URL.
      'redis-cli --tls -u redis://default:pw@x.upstash.io:6379',
    ])
      expect(loadConfig({ ...BASE, REDIS_URL }).redisUrl).toBe(
        'rediss://default:pw@x.upstash.io:6379',
      );
  });

  it('takes the R2 endpoint without the bucket after it', () => {
    expect(
      loadConfig({
        ...BASE,
        STORAGE_ENDPOINT: 'https://abc.r2.cloudflarestorage.com/sabeq-staging/',
      }).storage.endpoint,
    ).toBe('https://abc.r2.cloudflarestorage.com');
  });

  it('says what the bad URL starts with, never the secret in it', () => {
    let message = '';
    try {
      loadConfig({ ...BASE, REDIS_URL: 'https://x.upstash.io' });
    } catch (err) {
      message = String((err as Error).message);
    }
    expect(message).toContain('it starts with "https://"');
    expect(message).toContain('not the REST one');
    try {
      loadConfig({ ...BASE, REDIS_URL: 'AXXXsecrettoken123' });
    } catch (err) {
      message = String((err as Error).message);
    }
    expect(message).toContain('"AXXX…"');
    expect(message).not.toContain('secrettoken');
  });
});
