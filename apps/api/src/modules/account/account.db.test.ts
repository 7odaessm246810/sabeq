/**
 * The website user's own account: profile and devices. Real PostgreSQL + Redis (database 15).
 */
import { Redis } from 'ioredis';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_ENV } from '../../testing/env.js';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config/env.js';
import { createDb } from '../../infra/db.js';
import { createDocumentCrypto } from '../../infra/document-crypto.js';
import { createAuthModule } from '../auth/index.js';
import { createConsoleSender } from '../notifications/email.js';
import { createAccountModule } from './index.js';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl?.includes('_test')) throw new Error('must run against a *_test database');
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/15';

const silent = pino({ level: 'silent' });
const db = createDb({ url: dbUrl, poolMax: 4, logger: silent });
const redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 2 });

const config = loadConfig({
  ...TEST_ENV,
  DATABASE_URL: dbUrl,
  REDIS_URL: redisUrl.toString(),
});
const auth = createAuthModule({
  config,
  db,
  redis,
  logger: silent,
  crypto: createDocumentCrypto(config.documentKeys),
  email: createConsoleSender(silent),
  sendVerification: () => Promise.resolve({}),
});
const account = createAccountModule({ db, auth });
const app = createApp({
  config,
  logger: silent,
  mountV1(v1) {
    auth.mount(v1);
    account.mount(v1);
  },
});

let seq = 500_000 + Math.floor(Math.random() * 400_000);
const newEmail = () => `account${++seq}-${Date.now().toString(36)}@test.sabeq`;
const PASSWORD = 'account-test-pass';

/** A new account (or, for an email already used, another sign-in to it from this user agent). */
async function login(role: 'student' | 'mentor' = 'student', email = newEmail(), ua = 'test') {
  const agent = request.agent(app);
  const known = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (known) {
    await agent
      .post('/api/v1/auth/login')
      .set('User-Agent', ua)
      .send({ email, password: PASSWORD })
      .expect(200);
  } else {
    const res = await agent
      .post('/api/v1/auth/register')
      .set('User-Agent', ua)
      .send({ fullName: 'Account Test', email, password: PASSWORD, role })
      .expect(201);
    // Starts without a name, as the profile tests expect.
    await db.user.update({ where: { id: res.body.data.user.id }, data: { fullName: null } });
  }
  return { agent, email };
}

beforeEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await redis.quit();
  await db.$disconnect();
});

describe('profile', () => {
  it('needs a session', async () => {
    await request(app).get('/api/v1/me/profile').expect(401);
  });

  it('lets a new student complete the profile, and /auth/me stops asking for it', async () => {
    const { agent } = await login();
    const empty = await agent.get('/api/v1/me/profile').expect(200);
    expect(empty.body.data.profile).toMatchObject({
      fullName: null,
      role: 'student',
      student: { track: null, schoolYear: null, governorate: null, interests: [] },
    });

    const res = await agent
      .patch('/api/v1/me/profile')
      .send({
        fullName: '  ملك   أشرف ',
        track: 'science_math',
        schoolYear: 3,
        governorate: 'الجيزة',
        interests: ['med', 'eng', 'eng'],
      })
      .expect(200);
    expect(res.body.data.profile).toMatchObject({
      fullName: 'ملك أشرف',
      student: {
        track: 'science_math',
        schoolYear: 3,
        governorate: 'الجيزة',
        interests: ['eng', 'med'],
      },
    });

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.user).toMatchObject({ fullName: 'ملك أشرف', needsProfile: false });

    // Partial updates leave the rest alone; null clears a field.
    const next = await agent.patch('/api/v1/me/profile').send({ governorate: null }).expect(200);
    expect(next.body.data.profile.student).toMatchObject({
      track: 'science_math',
      governorate: null,
    });
  });

  it('validates every field in Arabic', async () => {
    const { agent } = await login();
    const res = await agent
      .patch('/api/v1/me/profile')
      .send({ fullName: 'x', track: 'medicine', schoolYear: 4, governorate: 'Paris' })
      .expect(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual([
      'fullName',
      'governorate',
      'schoolYear',
      'track',
    ]);
    await agent
      .patch('/api/v1/me/profile')
      .send({ interests: ['nope'] })
      .expect(400);
    await agent
      .patch('/api/v1/me/profile')
      .send({ interests: ['eng', 'med', 'pharm', 'dent', 'cs', 'law'] })
      .expect(400);
    await agent.patch('/api/v1/me/profile').send({ phone: '0123' }).expect(400);
  });

  it('keeps an optional contact number, one account per number', async () => {
    const a = await login();
    const b = await login();
    const local = `015${String(seq).padStart(8, '0')}`;
    const saved = await a.agent.patch('/api/v1/me/profile').send({ phone: local }).expect(200);
    expect(saved.body.data.profile.phone).toBe(`+20${local.slice(1)}`);
    const taken = await b.agent.patch('/api/v1/me/profile').send({ phone: local }).expect(400);
    expect(taken.body.error.fields.phone).toBeTruthy();
    const cleared = await a.agent.patch('/api/v1/me/profile').send({ phone: '' }).expect(200);
    expect(cleared.body.data.profile.phone).toBeNull();
  });

  it('keeps student fields away from mentors', async () => {
    const { agent } = await login('mentor');
    await agent.patch('/api/v1/me/profile').send({ fullName: 'أحمد محمد' }).expect(200);
    const res = await agent.patch('/api/v1/me/profile').send({ track: 'literary' }).expect(400);
    expect(res.body.error.fields.track).toBeTruthy();
  });
});

describe('devices', () => {
  it('lists signed-in devices and signs one out remotely', async () => {
    const email = newEmail();
    const laptop = await login(
      'student',
      email,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
    );
    const mobile = await login(
      'student',
      email,
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
    );

    const list = await laptop.agent.get('/api/v1/me/devices').expect(200);
    const devices = list.body.data.devices as { id: string; label: string; current: boolean }[];
    expect(devices.map((d) => d.label).sort()).toEqual(['Chrome · Android', 'Chrome · Windows']);
    expect(devices.find((d) => d.current)?.label).toBe('Chrome · Windows');

    const phoneDevice = devices.find((d) => !d.current);
    await laptop.agent.delete(`/api/v1/me/devices/${phoneDevice?.id}`).expect(200);
    await mobile.agent.get('/api/v1/auth/me').expect(401);
    await laptop.agent.get('/api/v1/auth/me').expect(200);
  });

  it("cannot sign out someone else's device", async () => {
    const a = await login();
    const b = await login();
    const bDevices = await b.agent.get('/api/v1/me/devices').expect(200);
    const id = bDevices.body.data.devices[0].id as string;
    await a.agent.delete(`/api/v1/me/devices/${id}`).expect(404);
    await b.agent.get('/api/v1/auth/me').expect(200);
  });
});
