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
import { createAuthModule } from '../auth/index.js';
import type { SmsSender } from '../auth/sms.js';
import { createAccountModule } from './index.js';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl?.includes('_test')) throw new Error('must run against a *_test database');
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/15';

const silent = pino({ level: 'silent' });
const db = createDb({ url: dbUrl, poolMax: 4, logger: silent });
const redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 2 });
const codes = new Map<string, string>();
const sms: SmsSender = {
  insecure: false,
  sendOtp(phone, code) {
    codes.set(phone, code);
    return Promise.resolve();
  },
};

const config = loadConfig({
  ...TEST_ENV,
  DATABASE_URL: dbUrl,
  REDIS_URL: redisUrl.toString(),
});
const auth = createAuthModule({ config, db, redis, logger: silent, sms });
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
const newPhone = () => `011${String(++seq).padStart(8, '0')}`;

async function login(role: 'student' | 'mentor' = 'student', phone = newPhone(), ua = 'test') {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/otp/request').send({ phone }).expect(202);
  await agent
    .post('/api/v1/auth/otp/verify')
    .set('User-Agent', ua)
    .send({ phone, role, code: codes.get(`+20${phone.slice(1)}`) })
    .expect(200);
  return { agent, phone };
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
    await agent.patch('/api/v1/me/profile').send({ phone: '+201000000000' }).expect(400);
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
    const phone = newPhone();
    const laptop = await login(
      'student',
      phone,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
    );
    await redis.flushdb(); // resend cooldown
    const mobile = await login(
      'student',
      phone,
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
