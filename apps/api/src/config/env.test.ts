import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

describe('loadConfig', () => {
  it('uses safe local defaults', () => {
    const c = loadConfig({});
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
      API_PORT: '8080',
      CORS_ORIGINS: 'https://a.example, https://b.example',
    });
    expect(c.port).toBe(8080);
    expect(c.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('lists every invalid variable at once', () => {
    try {
      loadConfig({ API_PORT: 'abc', LOG_LEVEL: 'loud', CORS_ORIGINS: 'not a url' });
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
        APP_ENV: 'production',
        NODE_ENV: 'development',
        CORS_ORIGINS: 'http://sabeq.example',
      }),
    ).toThrow(/https[\s\S]*NODE_ENV|NODE_ENV[\s\S]*https/);
    expect(
      loadConfig({
        APP_ENV: 'production',
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://sabeq.example',
      }).appEnv,
    ).toBe('production');
  });
});
