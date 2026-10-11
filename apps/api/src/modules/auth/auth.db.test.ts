/**
 * Email + password, Google and admin app-code login end to end (ADR-0017): real PostgreSQL
 * (scripts/test-db.ts) and real Redis (database 15, flushed per test). Emails go to the console
 * sender (kept in memory) and Google is a fake that answers what the test sets.
 */
import { Router } from 'express';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_ENV } from '../../testing/env.js';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config/env.js';
import { sendData } from '../../core/http.js';
import { createDb } from '../../infra/db.js';
import { createDocumentCrypto } from '../../infra/document-crypto.js';
import { createConsoleSender } from '../notifications/email.js';
import { AUTH_LIMITS } from './auth.service.js';
import type { GoogleClient } from './google.js';
import { createAuthModule, requireAdmin, requireRole } from './index.js';
import { hashPassword } from './password.js';
import { currentStep, totpAt } from './totp.js';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl?.includes('_test'))
  throw new Error('auth.db.test.ts must run against a *_test database');
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/15';

const silent = pino({ level: 'silent' });
const db = createDb({ url: dbUrl, poolMax: 4, logger: silent });
const redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 2 });
const config = loadConfig({
  ...TEST_ENV,
  APP_ENV: 'local',
  AUTH_EMAIL_CONFIRMATION: 'true',
  DATABASE_URL: dbUrl,
  REDIS_URL: redisUrl.toString(),
});
const crypto = createDocumentCrypto(config.documentKeys);
const mail = createConsoleSender(silent);
const verifications: { userId: string; email: string }[] = [];

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
let googleAnswer: Record<string, unknown> = {};
let lastNonce = '';
const google: GoogleClient = {
  authorizeUrl(p) {
    lastNonce = p.nonce;
    return `https://accounts.google.test/auth?state=${p.state}`;
  },
  exchange: () => Promise.resolve({ ...googleAnswer, nonce: lastNonce }),
};

const auth = createAuthModule({
  config,
  db,
  redis,
  logger: silent,
  crypto,
  email: mail,
  sendVerification: (userId, email) => {
    verifications.push({ userId, email });
    return Promise.resolve({ devLink: 'http://localhost:3000/verify-email?token=x' });
  },
  google: { client: google, clientId: CLIENT_ID },
});
const app = createApp({
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
});

// Unique per run: the test database persists between tests in one run.
let seq = Math.floor(Math.random() * 1e6);
const newEmail = () => `auth${++seq}-${Date.now().toString(36)}@test.sabeq`;
const PASSWORD = 'correct horse battery';

async function register(
  over: Partial<{ email: string; role: 'student' | 'mentor'; password: string }> = {},
) {
  const agent = request.agent(app);
  const email = over.email ?? newEmail();
  const res = await agent.post('/api/v1/auth/register').send({
    fullName: 'ملك أشرف',
    email,
    password: over.password ?? PASSWORD,
    role: over.role ?? 'student',
  });
  return { agent, res, email };
}

const login = (email: string, password = PASSWORD, agent = request.agent(app)) =>
  agent.post('/api/v1/auth/login').send({ email, password });

/** Follows /auth/google → fake Google → callback; returns where the browser lands. */
async function googleSignIn(answer: Record<string, unknown>, role = 'student') {
  googleAnswer = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: Date.now() / 1000 + 300,
    email_verified: true,
    ...answer,
  };
  const agent = request.agent(app);
  const start = await agent.get(`/api/v1/auth/google?role=${role}`).expect(303);
  const state = new URL(String(start.headers.location)).searchParams.get('state');
  const back = await agent.get(`/api/v1/auth/google/callback?code=abc&state=${state}`).expect(303);
  return { agent, location: String(back.headers.location) };
}

beforeEach(async () => {
  await redis.flushdb();
  mail.sent.length = 0;
  verifications.length = 0;
});

afterAll(async () => {
  await redis.quit();
  await db.$disconnect();
});

describe('sign-up', () => {
  it('makes a student with a profile, signs in, and sends the confirmation link', async () => {
    const { agent, res, email } = await register({ email: `Mixed.Case${++seq}@Test.Sabeq` });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      isNew: true,
      devLink: expect.stringContaining('/verify-email'),
      user: {
        role: 'student',
        fullName: 'ملك أشرف',
        email: email.toLowerCase(),
        emailVerified: false,
        hasPassword: true,
        phone: null,
      },
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^sb_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const user = await db.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
      include: { student: true },
    });
    expect(user.student).not.toBeNull();
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(verifications).toEqual([{ userId: user.id, email: email.toLowerCase() }]);

    await agent.get('/api/v1/probe/student-only').expect(200);
    await agent.post('/api/v1/auth/logout').expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('validates in Arabic and refuses a taken email whatever its case', async () => {
    const bad = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: 'x', email: 'not-an-email', password: 'short', role: 'admin' })
      .expect(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual([
      'email',
      'fullName',
      'password',
      'role',
    ]);

    const { email } = await register();
    const again = await register({ email: email.toUpperCase() });
    expect(again.res.status).toBe(400);
    expect(again.res.body.error.fields.email).toBeTruthy();
  });

  it('makes mentor applicants without a student profile', async () => {
    const { res } = await register({ role: 'mentor' });
    expect(res.body.data.user.role).toBe('mentor');
    const user = await db.user.findUniqueOrThrow({
      where: { id: res.body.data.user.id },
      include: { student: true },
    });
    expect(user.student).toBeNull();
  });
});

describe('sign-in', () => {
  it('signs in with the email in any case, and answers the same for every mistake', async () => {
    const { email } = await register();
    const ok = await login(email.toUpperCase()).expect(200);
    expect(ok.body.data.user.email).toBe(email);

    const wrong = await login(email, 'wrong password').expect(401);
    const unknown = await login(newEmail()).expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks an account after too many wrong passwords, even for the right one', async () => {
    const { email } = await register();
    for (let i = 0; i < AUTH_LIMITS.failuresPerEmail.limit; i++)
      await login(email, `wrong-${i}`).expect(401);
    const locked = await login(email).expect(429);
    expect(locked.headers['retry-after']).toBeTruthy();
  });

  it('refuses suspended accounts and kills their sessions immediately', async () => {
    const { agent, email, res } = await register();
    await agent.get('/api/v1/auth/me').expect(200); // now cached in Redis
    await db.user.update({ where: { id: res.body.data.user.id }, data: { status: 'suspended' } });
    await auth.sessions.revokeAll(res.body.data.user.id);
    await agent.get('/api/v1/auth/me').expect(401);
    await login(email).expect(403);
  });
});

describe('passwords', () => {
  it('resets from the emailed link once, confirms the email and signs out everywhere', async () => {
    const { agent, email } = await register();
    const unknown = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: newEmail() })
      .expect(202);
    expect(unknown.body.data).toEqual({ sent: true });
    expect(mail.sent).toHaveLength(0);

    const asked = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email })
      .expect(202);
    expect(mail.sent).toHaveLength(1);
    const token = new URL(asked.body.data.devLink as string).searchParams.get('token') ?? '';

    await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: 'a brand new password' })
      .expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
    // Used once: the hash changed, so the same link is dead.
    await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token, password: 'another new password' })
      .expect(409);

    await login(email).expect(401);
    const fresh = await login(email, 'a brand new password').expect(200);
    expect(fresh.body.data.user.emailVerified).toBe(true);
  });

  it('changes the password with the current one and keeps only this device', async () => {
    const { agent, email } = await register();
    const other = request.agent(app);
    await login(email, PASSWORD, other).expect(200);

    await agent
      .post('/api/v1/auth/password/change')
      .send({ current: 'nope', password: 'changed password!' })
      .expect(400);
    await agent
      .post('/api/v1/auth/password/change')
      .send({ current: PASSWORD, password: 'changed password!' })
      .expect(200);
    await agent.get('/api/v1/auth/me').expect(200);
    await other.get('/api/v1/auth/me').expect(401);
    await login(email, 'changed password!').expect(200);
  });
});

describe('Google', () => {
  it('makes a confirmed account on the first visit and finds it again by Google id', async () => {
    const sub = `g-${++seq}`;
    const email = newEmail();
    const first = await googleSignIn({ sub, email, name: 'Salma Adel' }, 'mentor');
    expect(first.location).toBe('/login?google=new');
    const me = await first.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.user).toMatchObject({
      role: 'mentor',
      email,
      emailVerified: true,
      hasPassword: false,
      fullName: 'Salma Adel',
    });

    const again = await googleSignIn({ sub, email: 'changed@test.sabeq' });
    expect(again.location).toBe('/login?google=ok');
  });

  it('links an unconfirmed password account and drops the password whoever set it', async () => {
    const { agent, email } = await register();
    const linked = await googleSignIn({ sub: `g-${++seq}`, email });
    expect(linked.location).toBe('/login?google=ok');
    // The address was never proven: the old password and its sessions are gone.
    await agent.get('/api/v1/auth/me').expect(401);
    await login(email).expect(401);
    const me = await linked.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.user).toMatchObject({ emailVerified: true, hasPassword: false });
  });

  it('refuses a bad state, an unverified Google email and admin accounts', async () => {
    googleAnswer = {};
    const agent = request.agent(app);
    await agent.get('/api/v1/auth/google').expect(303);
    const forged = await agent
      .get('/api/v1/auth/google/callback?code=abc&state=forged')
      .expect(303);
    expect(forged.headers.location).toBe('/login?google=failed');

    const unverified = await googleSignIn({
      sub: `g-${++seq}`,
      email: newEmail(),
      email_verified: false,
    });
    expect(unverified.location).toBe('/login?google=failed');

    const adminEmail = newEmail();
    await db.user.create({
      data: {
        email: adminEmail,
        role: 'admin',
        fullName: 'Admin',
        admin: { create: { adminRole: 'support' } },
      },
    });
    const admin = await googleSignIn({ sub: `g-${++seq}`, email: adminEmail });
    expect(admin.location).toBe('/login?google=admin');

    const cancelled = await request(app)
      .get('/api/v1/auth/google/callback?error=access_denied')
      .expect(303);
    expect(cancelled.headers.location).toBe('/login?google=cancelled');
  });
});

describe('admin login', () => {
  async function makeAdmin(adminRole: 'finance' | 'support') {
    const email = newEmail();
    await db.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        role: 'admin',
        fullName: 'Admin',
        admin: { create: { adminRole } },
      },
    });
    return email;
  }

  const adminLogin = (
    agent: ReturnType<typeof request.agent>,
    email: string,
    password = PASSWORD,
  ) => agent.post('/api/v1/admin/auth/login').send({ email, password });

  it('sets up the app code on the first sign-in, then asks for it every time', async () => {
    const email = await makeAdmin('finance');
    const agent = request.agent(app);
    const first = await adminLogin(agent, email).expect(200);
    expect(first.body.data).toMatchObject({
      step: 'setup',
      uri: expect.stringMatching(/^otpauth:\/\/totp\//),
    });
    const secret = first.body.data.secret as string;

    await agent
      .post('/api/v1/admin/auth/totp')
      .send({ challenge: first.body.data.challenge, code: '000000' })
      .expect(400);
    const step = currentStep(Date.now());
    const done = await agent
      .post('/api/v1/admin/auth/totp')
      .send({ challenge: first.body.data.challenge, code: totpAt(secret, step) })
      .expect(200);
    expect(String(done.headers['set-cookie'])).toMatch(/^sb_admin=/);
    expect(done.body.data.user).toMatchObject({ role: 'admin', adminRole: 'finance' });
    await agent.get('/api/v1/admin/probe/finance').expect(200);
    // The admin cookie is not a website session.
    await agent.get('/api/v1/auth/me').expect(401);

    const stored = await db.admin.findFirstOrThrow({ where: { user: { email } } });
    expect(stored.totpEnabledAt).not.toBeNull();
    expect(stored.totpSecretEnc).not.toContain(secret);

    // Next time: the code only, and the code just used cannot be replayed.
    const second = await adminLogin(request.agent(app), email).expect(200);
    expect(second.body.data).toEqual({ step: 'totp', challenge: expect.any(String) });
    await request(app)
      .post('/api/v1/admin/auth/totp')
      .send({ challenge: second.body.data.challenge, code: totpAt(secret, step) })
      .expect(400);
    await request(app)
      .post('/api/v1/admin/auth/totp')
      .send({ challenge: second.body.data.challenge, code: totpAt(secret, step + 1) })
      .expect(200);

    const audit = await db.auditLog.findMany({
      where: {
        actorUserId: done.body.data.user.id,
        action: { in: ['auth.login', 'auth.totp_enabled'] },
      },
    });
    expect(audit.map((a) => a.action).sort()).toEqual([
      'auth.login',
      'auth.login',
      'auth.totp_enabled',
    ]);
  });

  it('burns the step after five wrong codes', async () => {
    const email = await makeAdmin('support');
    const first = await adminLogin(request.agent(app), email).expect(200);
    for (let i = 0; i < AUTH_LIMITS.challengeAttempts; i++)
      await request(app)
        .post('/api/v1/admin/auth/totp')
        .send({ challenge: first.body.data.challenge, code: '000000' })
        .expect(400);
    await request(app)
      .post('/api/v1/admin/auth/totp')
      .send({
        challenge: first.body.data.challenge,
        code: totpAt(first.body.data.secret, currentStep(Date.now())),
      })
      .expect(401);
  });

  it('keeps website and admin accounts apart', async () => {
    const adminEmail = await makeAdmin('finance');
    await login(adminEmail).expect(403);

    const { email } = await register();
    const asAdmin = await adminLogin(request.agent(app), email).expect(401);
    const wrong = await adminLogin(request.agent(app), adminEmail, 'nope').expect(401);
    expect(asAdmin.body.error.message).toBe(wrong.body.error.message);
  });

  it('checks the admin role on admin routes and refuses website sessions there', async () => {
    const email = await makeAdmin('support');
    const agent = request.agent(app);
    const first = await adminLogin(agent, email).expect(200);
    await agent
      .post('/api/v1/admin/auth/totp')
      .send({
        challenge: first.body.data.challenge,
        code: totpAt(first.body.data.secret, currentStep(Date.now())),
      })
      .expect(200);
    await agent.get('/api/v1/admin/probe/finance').expect(403);

    const web = await register();
    await web.agent.get('/api/v1/admin/probe/finance').expect(401);
  });
});
