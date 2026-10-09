/**
 * Mentor applications end to end: real PostgreSQL, Redis (db 15) and the local S3 gateway
 * (bucket `sabeq-test`). Documents must land in storage encrypted.
 */
import { Redis } from 'ioredis';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config/env.js';
import { createDb } from '../../infra/db.js';
import { createDocumentCrypto } from '../../infra/document-crypto.js';
import { createObjectStore } from '../../infra/storage.js';
import { TEST_ENV } from '../../testing/env.js';
import { createAuthModule } from '../auth/index.js';
import type { SmsSender } from '../auth/sms.js';
import { createCatalogModule } from '../catalog/index.js';
import { createMentorApplicationModule } from './index.js';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl?.includes('_test')) throw new Error('must run against a *_test database');
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/15';

const silent = pino({ level: 'silent' });
const config = loadConfig({ ...TEST_ENV, DATABASE_URL: dbUrl, REDIS_URL: redisUrl.toString() });
const db = createDb({ url: dbUrl, poolMax: 4, logger: silent });
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
const auth = createAuthModule({ config, db, redis, logger: silent, sms });
const mentorApplication = createMentorApplicationModule({ db, store, crypto, auth });
const app = createApp({
  config,
  logger: silent,
  mountV1(v1) {
    auth.mount(v1);
    createCatalogModule({ db, auth }).mount(v1);
    mentorApplication.mount(v1);
  },
});

const PDF = Buffer.from('%PDF-1.7\n% graduation certificate of a test mentor\n%%EOF');
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('national id photo'),
]);
const BASE = '/api/v1/mentor/application';

/** Fails the test with a clear message instead of a non-null assertion. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

let seq = 200_000 + Math.floor(Math.random() * 300_000);
const newPhone = () => `012${String(++seq).padStart(8, '0')}`;

async function login(role: 'student' | 'mentor' = 'mentor') {
  const phone = newPhone();
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/otp/request').send({ phone }).expect(202);
  const res = await agent
    .post('/api/v1/auth/otp/verify')
    .send({ phone, role, code: codes.get(`+20${phone.slice(1)}`) })
    .expect(200);
  return { agent, userId: res.body.data.user.id as string };
}

let cairo: { slug: string; faculties: { id: string; kind: string }[] };
let otherFacultyId = '';

beforeAll(async () => {
  await store.ensureBucket();
  const res = await request(app).get('/api/v1/catalog/universities').expect(200);
  const unis = res.body.data.universities as (typeof cairo)[];
  cairo = must(unis.find((u) => u.slug === 'cairo') ?? unis[0], 'a seeded university');
  otherFacultyId = must(
    unis.find((u) => u.slug !== cairo.slug)?.faculties[0],
    'a faculty in another university',
  ).id;
});

beforeEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await redis.quit();
  await db.$disconnect();
});

const complete = () => ({
  fullName: 'أحمد محمد',
  kind: 'graduate',
  universitySlug: cairo.slug,
  facultyId: must(cairo.faculties[0], 'a faculty').id,
  major: 'هندسة الحاسبات',
  graduationYear: 2024,
  basePriceEgp: 250,
  days: ['mon', 'sat'],
  topics: 'الإعدادي، التدريب',
});

describe('catalog', () => {
  it('lists universities with their faculties', () => {
    expect(cairo.faculties.length).toBeGreaterThan(5);
    expect(cairo.faculties[0]).toMatchObject({ id: expect.any(String), kind: expect.any(String) });
  });
});

describe('access', () => {
  it('is for signed-in mentor accounts only', async () => {
    await request(app).get(BASE).expect(401);
    const { agent } = await login('student');
    await agent.get(BASE).expect(403);
  });
});

describe('draft', () => {
  it('starts empty, saves partial steps and normalises them', async () => {
    const { agent } = await login();
    expect((await agent.get(BASE).expect(200)).body.data.application).toBeNull();

    const first = await agent
      .put(BASE)
      .send({ fullName: 'أحمد  محمد', kind: 'graduate' })
      .expect(200);
    expect(first.body.data.application).toMatchObject({
      status: 'draft',
      payload: { kind: 'graduate' },
    });

    const second = await agent.put(BASE).send({ days: ['sat', 'mon', 'sat'], basePriceEgp: 250 });
    expect(second.body.data.application.payload).toEqual({
      kind: 'graduate',
      days: ['sat', 'mon'],
      basePriceEgp: 250,
    });
  });

  it('validates values and the university–faculty pair', async () => {
    const { agent } = await login();
    const bad = await agent
      .put(BASE)
      .send({ basePriceEgp: 255, kind: 'student', graduationYear: 3000, fullName: 'أحمد' })
      .expect(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual([
      'basePriceEgp',
      'fullName',
      'graduationYear',
      'kind',
    ]);
    const mismatch = await agent
      .put(BASE)
      .send({ universitySlug: cairo.slug, facultyId: otherFacultyId })
      .expect(400);
    expect(mismatch.body.error.fields.facultyId).toBeTruthy();
  });
});

describe('documents', () => {
  it('stores files encrypted, replaces a slot, and refuses fake types and big files', async () => {
    const { agent } = await login();
    await agent.put(BASE).send({ kind: 'graduate' }).expect(200);

    const fake = await agent
      .post(`${BASE}/documents/credential`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('MZ this is an exe'))
      .expect(400);
    expect(fake.body.error.fields.file).toBeTruthy();

    await agent
      .post(`${BASE}/documents/credential`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.alloc(10 * 1024 * 1024 + 1, 0x25))
      .expect(413);

    const up = await agent
      .post(`${BASE}/documents/credential`)
      .set('Content-Type', 'application/pdf')
      .send(PDF)
      .expect(201);
    expect(up.body.data.document).toMatchObject({
      kind: 'graduation_certificate',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
    });

    const row = await db.mentorDocument.findUniqueOrThrow({
      where: { id: up.body.data.document.id },
    });
    const stored = await store.get(row.storageKey);
    expect(stored.includes(Buffer.from('graduation certificate'))).toBe(false);
    expect(
      crypto.open(stored, must(row.encryptionKeyId, 'key id'), row.storageKey).equals(PDF),
    ).toBe(true);

    // Re-uploading the slot replaces the file and removes the old object.
    await agent
      .post(`${BASE}/documents/credential`)
      .set('Content-Type', 'image/jpeg')
      .send(JPEG)
      .expect(201);
    const docs = (await agent.get(BASE)).body.data.application.documents;
    expect(docs).toHaveLength(1);
    await expect(store.get(row.storageKey)).rejects.toThrow();

    await agent.delete(`${BASE}/documents/${docs[0].id}`).expect(200);
    expect((await agent.get(BASE)).body.data.application.documents).toHaveLength(0);
  });
});

describe('submit', () => {
  async function ready(agent: ReturnType<typeof request.agent>) {
    await agent.put(BASE).send(complete()).expect(200);
    await agent
      .post(`${BASE}/documents/credential`)
      .set('Content-Type', 'application/pdf')
      .send(PDF)
      .expect(201);
    await agent
      .post(`${BASE}/documents/national_id_front`)
      .set('Content-Type', 'image/jpeg')
      .send(JPEG)
      .expect(201);
  }

  it('lists everything missing', async () => {
    const { agent } = await login();
    await agent.put(BASE).send({ kind: 'teaching_assistant' }).expect(200);
    const res = await agent.post(`${BASE}/submit`).expect(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual([
      'basePriceEgp',
      'credential',
      'days',
      'facultyId',
      'fullName',
      'graduationYear',
      'major',
      'national_id_front',
      'universitySlug',
    ]);
  });

  it('submits a complete application, audits it, and locks editing', async () => {
    const { agent, userId } = await login();
    await ready(agent);
    const res = await agent.post(`${BASE}/submit`).expect(200);
    expect(res.body.data.application).toMatchObject({ status: 'submitted' });
    expect(res.body.data.application.submittedAt).toBeTruthy();

    const audit = await db.auditLog.findFirst({
      where: { actorUserId: userId, action: 'mentor_application.submit' },
    });
    expect(audit).not.toBeNull();

    await agent.put(BASE).send({ major: 'تاني' }).expect(409);
    await agent
      .post(`${BASE}/documents/credential`)
      .set('Content-Type', 'application/pdf')
      .send(PDF)
      .expect(409);
    await agent.post(`${BASE}/submit`).expect(409);
  });

  it('reopens on changes requested, and allows a new application after rejection', async () => {
    const { agent, userId } = await login();
    await ready(agent);
    const submitted = (await agent.post(`${BASE}/submit`).expect(200)).body.data.application;

    await db.mentorApplication.update({
      where: { id: submitted.id },
      data: { status: 'changes_requested', decisionNote: 'الصورة مش واضحة' },
    });
    const reopened = await agent.put(BASE).send({ major: 'هندسة الاتصالات' }).expect(200);
    expect(reopened.body.data.application).toMatchObject({
      id: submitted.id,
      status: 'changes_requested',
      decisionNote: 'الصورة مش واضحة',
    });
    await agent.post(`${BASE}/submit`).expect(200);

    const admin = await db.user.create({
      data: { phone: `+20${newPhone().slice(1)}`, role: 'admin', fullName: 'Reviewer' },
    });
    await db.mentorApplication.update({
      where: { id: submitted.id },
      data: { status: 'rejected', decidedAt: new Date(), reviewerId: admin.id },
    });
    const fresh = await agent.put(BASE).send({ kind: 'professor' }).expect(200);
    expect(fresh.body.data.application.id).not.toBe(submitted.id);
    expect(fresh.body.data.application.status).toBe('draft');
    expect(await db.mentorApplication.count({ where: { userId } })).toBe(2);
  });
});
