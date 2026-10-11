/**
 * The whole API wired like server.ts, against the test database, Redis db 15 and the local S3
 * gateway (bucket `sabeq-test`), with in-memory email and a fake Google — for integration tests.
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
import type { GoogleClient } from '../modules/auth/google.js';
import { hashPassword } from '../modules/auth/password.js';
import { currentStep, newTotpSecret, totpAt } from '../modules/auth/totp.js';
import { createBookingsModule } from '../modules/bookings/index.js';
import { createCatalogModule } from '../modules/catalog/index.js';
import { createPaymentsModule } from '../modules/payments/index.js';
import { createSessionsModule } from '../modules/sessions/index.js';
import { createReviewsModule } from '../modules/reviews/index.js';
import { createNotificationsModule } from '../modules/notifications/index.js';
import { createPayoutsModule } from '../modules/payouts/index.js';
import { createAdminModule } from '../modules/admin/index.js';
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
  const emails = createConsoleSender(logger);
  /** What Google "returns" for the next sign-in (tests set it; the nonce is filled in). */
  const google = {
    next: null as Record<string, unknown> | null,
    lastAuthorize: null as URL | null,
  };
  const googleClient: GoogleClient = {
    authorizeUrl(p) {
      const u = new URL('https://accounts.google.test/auth');
      for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
      google.lastAuthorize = u;
      return u.toString();
    },
    exchange() {
      if (!google.next) return Promise.reject(new Error('no google answer set'));
      return Promise.resolve({
        ...google.next,
        nonce: google.lastAuthorize?.searchParams.get('nonce'),
      });
    },
  };

  const auth = createAuthModule({
    config,
    db,
    redis,
    logger,
    crypto,
    email: emails,
    sendVerification: (userId, address) =>
      notifications.notifications.sendVerification(userId, address),
    google: { client: googleClient, clientId: 'test-client.apps.googleusercontent.com' },
  });
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
  const notifications = createNotificationsModule({
    db,
    redis,
    auth,
    config,
    logger,
    email: emails,
  });
  const payouts = createPayoutsModule({ db, crypto, auth });
  const admin = createAdminModule({
    db,
    auth,
    bookings: bookings.bookings,
    onMentorsChanged: () => mentors.mentors.invalidate(),
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
      payouts.mount(v1);
      admin.mount(v1);
    },
  });

  // Unique per run and per call: the test database lives for the whole run.
  let seq = Math.floor(Math.random() * 9e6);
  const newPhone = () => `015${String(++seq % 1e8).padStart(8, '0')}`;
  const e164 = (local: string) => `+20${local.slice(1)}`;

  const newEmail = () => `user${++seq}-${Date.now().toString(36)}@test.sabeq`;
  const PASSWORD = 'test-password-123';

  // Every test signs in from the same address; the per-IP limits (tested on their own in
  // auth.db.test) would otherwise trip across files and across runs within the hour.
  async function clearIpLimits() {
    const keys = await redis.keys('auth:*:ip:*');
    if (keys.length) await redis.del(...keys);
  }

  /**
   * A new website account through the real sign-up, then (directly) a confirmed email and a phone,
   * as most tests need someone who can book.
   */
  async function loginWeb(role: 'student' | 'mentor', phone = newPhone()) {
    await clearIpLimits();
    const agent = request.agent(app);
    const email = newEmail();
    const res = await agent
      .post('/api/v1/auth/register')
      .send({
        fullName: role === 'student' ? 'Student Test' : 'Mentor Test',
        email,
        password: PASSWORD,
        role,
      })
      .expect(201);
    const userId = res.body.data.user.id as string;
    await db.user.update({
      where: { id: userId },
      // No name yet, like a phone sign-up used to be: tests of the profile step start from there.
      data: { emailVerifiedAt: new Date(), phone: e164(phone), fullName: null },
    });
    return { agent, userId, phone, email };
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
    /** Payouts service (balances are checked directly). */
    payoutsService: payouts.payouts,
    /** Every email "sent" (the console sender keeps them). */
    emails: emails.sent,
    crypto,
    newPhone,
    newEmail,
    PASSWORD,
    clearIpLimits,
    /** Set what the fake Google answers next (`nonce` is copied from the last redirect). */
    google,
    /** A website account with a confirmed email (new number unless one is given). */
    loginWeb,
    /**
     * An admin account created directly (as `pnpm admin:create` + its link do) with the app code
     * already set up, signed in through both steps.
     */
    async loginAdmin(adminRole: AdminRole) {
      await clearIpLimits();
      const email = newEmail();
      const totpSecret = newTotpSecret();
      const user = await db.user.create({
        data: {
          email,
          emailVerifiedAt: new Date(),
          passwordHash: await hashPassword(PASSWORD),
          role: 'admin',
          fullName: `Admin ${adminRole}`,
          admin: { create: { adminRole } },
        },
        select: { id: true },
      });
      const { keyId, blob } = crypto.seal(Buffer.from(totpSecret), `totp:${user.id}`);
      await db.admin.update({
        where: { userId: user.id },
        data: { totpSecretEnc: `${keyId}.${blob.toString('base64')}`, totpEnabledAt: new Date() },
      });
      const agent = request.agent(app);
      const step = await agent
        .post('/api/v1/admin/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      await agent
        .post('/api/v1/admin/auth/totp')
        .send({
          challenge: step.body.data.challenge,
          code: totpAt(totpSecret, currentStep(Date.now())),
        })
        .expect(200);
      return { agent, userId: user.id, email, totpSecret };
    },
    async close() {
      await redis.quit();
      await db.$disconnect();
    },
  };
}
