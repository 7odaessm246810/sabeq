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
import { createBookingsModule } from '../modules/bookings/index.js';
import { createCatalogModule } from '../modules/catalog/index.js';
import { createPaymentsModule } from '../modules/payments/index.js';
import { createSessionsModule } from '../modules/sessions/index.js';
import { createReviewsModule } from '../modules/reviews/index.js';
import { createNotificationsModule } from '../modules/notifications/index.js';
import { createConsoleSender } from '../modules/notifications/email.js';
import { createMediaModule } from '../modules/media/index.js';
import { createSchedulingModule } from '../modules/scheduling/index.js';
import { createSearchModule } from '../modules/search/index.js';
import { createMentorsModule } from '../modules/mentors/index.js';
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
  const scheduling = createSchedulingModule({ db, auth });
  const mentors = createMentorsModule({
    db,
    auth,
    avatars: media.avatars,
    nextSlots: scheduling.scheduling.nextSlots,
    indexTtlMs: 0,
  });
  const bookings = createBookingsModule({
    db,
    auth,
    scheduling: scheduling.scheduling,
    // Late-bound: payments is created next and needs bookings.
    onRefundDue: (id) => payments.payments.refundBooking(id),
  });
  const payments = createPaymentsModule({
    db,
    auth,
    bookings: bookings.bookings,
    config,
    logger,
  });
  const sessions = createSessionsModule({
    db,
    auth,
    bookings: bookings.bookings,
    config,
    logger,
  });
  const reviews = createReviewsModule({
    db,
    auth,
    onRatingChanged: () => mentors.mentors.invalidate(),
  });
  const emails = createConsoleSender(logger);
  const notifications = createNotificationsModule({
    db,
    redis,
    auth,
    config,
    logger,
    email: emails,
  });
  const search = createSearchModule({ catalog: catalog.catalog, mentors: mentors.mentors, redis });
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
      scheduling.mount(v1);
      mentors.mount(v1);
      search.mount(v1);
      bookings.mount(v1);
      payments.mount(v1);
      sessions.mount(v1);
      reviews.mount(v1);
      notifications.mount(v1);
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
    // Every test signs in from the same address; the per-IP hourly limits (tested on their own in
    // auth.db.test) would otherwise trip across files and across runs within the hour.
    const ipKeys = await redis.keys('otp:*ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);
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
    /** Search service (popular terms are tested directly with chosen IPs). */
    searchService: search.search,
    /** Bookings service (the sweeper is tested directly). */
    bookingsService: bookings.bookings,
    /** Sessions service (the mentor no-show sweep is tested directly). */
    sessionsService: sessions.sessions,
    /** Notifications service (reminders and email sending are tested directly). */
    notificationsService: notifications.notifications,
    /** Every email "sent" (the console sender keeps them). */
    emails: emails.sent,
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
