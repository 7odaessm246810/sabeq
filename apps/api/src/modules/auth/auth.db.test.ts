/**
 * Phone + OTP login end to end: real PostgreSQL (scripts/test-db.ts) and real Redis (database 15,
 * flushed per test). SMS goes to an in-memory fake so tests can read the codes.
 */
import { Router } from 'express';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config/env.js';
import { sendData } from '../../core/http.js';
import { createDb } from '../../infra/db.js';
import { createAuthModule, requireAdmin, requireRole } from './index.js';
import type { SmsSender } from './sms.js';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl?.includes('_test'))
  throw new Error('auth.db.test.ts must run against a *_test database');
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/15';

const silent = pino({ level: 'silent' });
const db = createDb({ url: dbUrl, poolMax: 4, logger: silent });
const redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 2 });

const sent: { phone: string; code: string }[] = [];
const fakeSms: SmsSender = {
  insecure: false,
  sendOtp(phone, code) {
    sent.push({ phone, code });
    return Promise.resolve();
  },
};
const lastCode = (phone: string) => sent.findLast((s) => s.phone === phone)?.code ?? '';

function build(env: NodeJS.ProcessEnv = {}, sms: SmsSender | null = fakeSms) {
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ENV: 'local',
    DATABASE_URL: dbUrl,
    REDIS_URL: redisUrl.toString(),
    AUTH_OTP_SECRET: 'test-secret-test-secret-test-secret-00',
    ...env,
  });
  const auth = createAuthModule({ config, db, redis, logger: silent, ...(sms ? { sms } : {}) });
  return {
    auth,
    app: createApp({
      config,
      logger: silent,
      mountV1(v1) {
        auth.mount(v1);
        const probe = Router();
        probe.use(auth.authenticate('web'));
        probe.get('/student-only', requireRole('student'), (_req, res) => sendData(res, 'ok'));
        v1.use('/probe', probe);
        const adminProbe = Router();
        adminProbe.use(auth.authenticate('admin'));
        adminProbe.get('/finance', requireAdmin('finance'), (_req, res) => sendData(res, 'ok'));
        v1.use('/admin/probe', adminProbe);
      },
    }),
  };
}

const { app, auth } = build();

// Unique numbers per run: the test database persists between tests in one run.
let seq = Math.floor(Math.random() * 1e6);
const newPhone = () => `010${String(++seq).padStart(8, '0')}`;
const e164 = (local: string) => `+20${local.slice(1)}`;

async function login(phone: string, role: 'student' | 'mentor' = 'student', base = '/api/v1/auth') {
  const agent = request.agent(app);
  await agent.post(`${base}/otp/request`).send({ phone }).expect(202);
  const res = await agent
    .post(`${base}/otp/verify`)
    .send({ phone, code: lastCode(e164(phone)), role });
  return { agent, res };
}

beforeEach(async () => {
  await redis.flushdb();
  sent.length = 0;
});

afterAll(async () => {
  await redis.quit();
  await db.$disconnect();
});

describe('OTP request', () => {
  it('accepts Egyptian numbers in any common format and refuses others', async () => {
    const local = newPhone();
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: `+20 ${local.slice(1)}` })
      .expect(202);
    expect(res.body.data).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.phone).toBe(e164(local));
    expect(sent[0]?.code).toMatch(/^\d{6}$/);

    const bad = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '0123' })
      .expect(400);
    expect(bad.body.error.fields.phone).toBeTruthy();
  });

  it('enforces the resend cooldown with Retry-After', async () => {
    const phone = newPhone();
    await request(app).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
  });

  it('returns the code to the page only locally with the console sender', async () => {
    const local = build({}, null).app;
    const res = await request(local)
      .post('/api/v1/auth/otp/request')
      .send({ phone: newPhone() })
      .expect(202);
    expect(res.body.data.devCode).toMatch(/^\d{6}$/);

    const staging = build({ APP_ENV: 'staging' }, null).app;
    const res2 = await request(staging)
      .post('/api/v1/auth/otp/request')
      .send({ phone: newPhone() })
      .expect(202);
    expect(res2.body.data.devCode).toBeUndefined();
  });
});

describe('OTP verify and sessions', () => {
  it('signs up a new student, sets an httpOnly cookie, and /me works until logout', async () => {
    const phone = newPhone();
    const { agent, res } = await login(phone);
    expect(res.status).toBe(200);
    expect(res.body.data.isNew).toBe(true);
    expect(res.body.data.user).toMatchObject({
      role: 'student',
      phone: e164(phone),
      needsProfile: true,
    });

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^sb_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const user = await db.user.findUniqueOrThrow({
      where: { phone: e164(phone) },
      include: { student: true },
    });
    expect(user.student).not.toBeNull();

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.user.id).toBe(user.id);
    await agent.get('/api/v1/probe/student-only').expect(200);

    await agent.post('/api/v1/auth/logout').expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('rejects a wrong code with the attempts left, and burns it after 5 tries', async () => {
    const phone = newPhone();
    await request(app).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const right = lastCode(e164(phone));
    const wrong = right === '000000' ? '111111' : '000000';

    const first = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: wrong })
      .expect(400);
    expect(first.body.error.fields.code).toContain('4');

    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/v1/auth/otp/verify').send({ phone, code: wrong }).expect(400);
    }
    // Even the right code is useless now.
    await request(app).post('/api/v1/auth/otp/verify').send({ phone, code: right }).expect(400);
  });

  it('uses a code once only', async () => {
    const phone = newPhone();
    const { res } = await login(phone);
    expect(res.status).toBe(200);
    await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: lastCode(e164(phone)) })
      .expect(400);
  });

  it('keeps the existing role whatever is picked on the login screen', async () => {
    const phone = newPhone();
    const first = await login(phone, 'mentor');
    expect(first.res.body.data.user.role).toBe('mentor');
    await redis.flushdb();

    const again = await login(phone, 'student');
    expect(again.res.body.data).toMatchObject({ isNew: false, user: { role: 'mentor' } });
    // Mentors are not students: the student-only route refuses them.
    await again.agent.get('/api/v1/probe/student-only').expect(403);
  });

  it('refuses suspended accounts and kills their sessions immediately', async () => {
    const phone = newPhone();
    const { agent } = await login(phone);
    await agent.get('/api/v1/auth/me').expect(200); // now cached in Redis

    const user = await db.user.update({
      where: { phone: e164(phone) },
      data: { status: 'suspended' },
    });
    await auth.sessions.revokeAll(user.id);
    await agent.get('/api/v1/auth/me').expect(401);

    await redis.flushdb();
    const retry = await login(phone);
    expect(retry.res.status).toBe(403);
  });
});

describe('admin login', () => {
  async function makeAdmin(adminRole: 'finance' | 'support') {
    const phone = newPhone();
    await db.user.create({
      data: {
        phone: e164(phone),
        role: 'admin',
        fullName: 'Admin',
        admin: { create: { adminRole } },
      },
    });
    return phone;
  }

  it('sends no SMS to numbers that are not admins, with the same answer', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/otp/request')
      .send({ phone: newPhone() })
      .expect(202);
    expect(res.body.data).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    expect(sent).toHaveLength(0);
  });

  it('logs admins into the admin app only, with a separate cookie, and audits it', async () => {
    const phone = await makeAdmin('finance');

    const web = await login(phone);
    expect(web.res.status).toBe(403);
    await redis.flushdb();

    const { agent, res } = await login(phone, 'student', '/api/v1/admin/auth');
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/^sb_admin=/);
    expect(res.body.data.user).toMatchObject({ role: 'admin', adminRole: 'finance' });

    await agent.get('/api/v1/admin/probe/finance').expect(200);
    // The admin cookie is not a website session.
    await agent.get('/api/v1/auth/me').expect(401);

    const audit = await db.auditLog.findFirst({
      where: { actorUserId: res.body.data.user.id, action: 'auth.login' },
    });
    expect(audit).not.toBeNull();
  });

  it('checks the admin role on admin routes', async () => {
    const phone = await makeAdmin('support');
    const { agent } = await login(phone, 'student', '/api/v1/admin/auth');
    await agent.get('/api/v1/admin/probe/finance').expect(403);
  });

  it('refuses website sessions on admin routes', async () => {
    const { agent } = await login(newPhone());
    await agent.get('/api/v1/admin/probe/finance').expect(401);
  });
});
