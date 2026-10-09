/**
 * The whole API wired like server.ts, against the test database, Redis db 15 and the local S3
 * gateway (bucket `sabeq-test`), with an in-memory SMS sender — for integration tests.
 */
import { Redis } from 'ioredis';
import { pino } from 'pino';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import type { AdminRole } from '../generated/prisma/enums.js';
import { createDb } from '../infra/db.js';
import { createDocumentCrypto } from '../infra/document-crypto.js';
import { createObjectStore } from '../infra/storage.js';
import { createAccountModule } from '../modules/account/index.js';
import { createAuthModule } from '../modules/auth/index.js';
import type { SmsSender } from '../modules/auth/sms.js';
import { createCatalogModule } from '../modules/catalog/index.js';
import { createMediaModule } from '../modules/media/index.js';
import { createMentorApplicationModule } from '../modules/mentor-application/index.js';
import { createVerificationModule } from '../modules/verification/index.js';
import { TEST_ENV } from './env.js';

export function createHarness() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl?.includes('_test')) throw new Error('integration tests need a *_test database');
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  redisUrl.pathname = '/15';

  const logger = pino({ level: 'silent' });
  const config = loadConfig({ ...TEST_ENV, DATABASE_URL: dbUrl, REDIS_URL: redisUrl.toString() });
  const db = createDb({ url: dbUrl, poolMax: 4, logger });
  const redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 2 });
  const store = createObjectStore(config.storage);
  const crypto = createDocumentCrypto(config.documentKeys);
  const codes = new Map<string, string>();
  const sms: SmsSender = {
    insecure: false,
    sendOtp(phone, code) {
      codes.set(phone, code);
      return Promise.resolve();
    },
  };

  const auth = createAuthModule({ config, db, redis, logger, sms });
  const account = createAccountModule({ db, auth });
  const media = createMediaModule({ store });
  const catalog = createCatalogModule({ db, auth, logos: media.logos });
  const mentorApplication = createMentorApplicationModule({ db, store, crypto, auth });
  const verification = createVerificationModule({ db, store, crypto, auth });
  const app = createApp({
    config,
    logger,
    mountV1(v1) {
      auth.mount(v1);
      account.mount(v1);
      media.mount(v1);
      catalog.mount(v1);
      mentorApplication.mount(v1);
      verification.mount(v1);
    },
  });

  // Unique per run and per call: the test database lives for the whole run.
  let seq = Math.floor(Math.random() * 9e6);
  const newPhone = () => `015${String(++seq % 1e8).padStart(8, '0')}`;
  const e164 = (local: string) => `+20${local.slice(1)}`;

  async function login(phone: string, base: string, role?: 'student' | 'mentor') {
    await redis.del(`otp:cooldown:${e164(phone)}`);
    const agent = request.agent(app);
    await agent.post(`${base}/otp/request`).send({ phone }).expect(202);
    const res = await agent
      .post(`${base}/otp/verify`)
      .send({ phone, code: codes.get(e164(phone)), ...(role ? { role } : {}) })
      .expect(200);
    return { agent, userId: res.body.data.user.id as string, phone };
  }

  return {
    app,
    db,
    redis,
    store,
    crypto,
    newPhone,
    /** A website account (new number unless one is given). */
    loginWeb: (role: 'student' | 'mentor', phone = newPhone()) =>
      login(phone, '/api/v1/auth', role),
    /** An admin account created directly (as `pnpm admin:create` does) and signed in. */
    async loginAdmin(adminRole: AdminRole) {
      const phone = newPhone();
      await db.user.create({
        data: {
          phone: e164(phone),
          role: 'admin',
          fullName: `Admin ${adminRole}`,
          admin: { create: { adminRole } },
        },
      });
      return login(phone, '/api/v1/admin/auth');
    },
    async close() {
      await redis.quit();
      await db.$disconnect();
    },
  };
}
