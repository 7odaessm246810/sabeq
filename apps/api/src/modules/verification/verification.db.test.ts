/**
 * Admin review of mentor applications: queue, roles, decisions, mentor profile creation,
 * audited document access. Real PostgreSQL, Redis and S3 gateway.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
const PDF = Buffer.from('%PDF-1.7\n% degree\n%%EOF');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('id front')]);
const APP = '/api/v1/mentor/application';
const ADMIN = '/api/v1/admin';

let facultyId = '';
let universitySlug = '';

beforeAll(async () => {
  await h.store.ensureBucket();
  const res = await request(h.app).get('/api/v1/catalog/universities').expect(200);
  const uni = res.body.data.universities[0];
  universitySlug = uni.slug;
  facultyId = uni.faculties[0].id;
});

afterAll(() => h.close());

/** A mentor applicant with a complete, submitted application. */
async function submitted(topics = 'الإعدادي، التدريب الصيفي\nالفرق بين الأقسام') {
  const mentor = await h.loginWeb('mentor');
  await mentor.agent
    .put(APP)
    .send({
      fullName: 'سارة عبد الرحمن',
      kind: 'graduate',
      universitySlug,
      facultyId,
      major: 'هندسة الاتصالات',
      graduationYear: 2023,
      basePriceEgp: 300,
      days: ['sat', 'tue'],
      topics,
    })
    .expect(200);
  await mentor.agent
    .post(`${APP}/documents/credential`)
    .set('Content-Type', 'application/pdf')
    .send(PDF)
    .expect(201);
  await mentor.agent
    .post(`${APP}/documents/national_id_front`)
    .set('Content-Type', 'image/jpeg')
    .send(JPEG)
    .expect(201);
  const res = await mentor.agent.post(`${APP}/submit`).expect(200);
  return { ...mentor, applicationId: res.body.data.application.id as string };
}

describe('access', () => {
  it('needs an admin session with a reviewing role', async () => {
    await request(h.app).get(`${ADMIN}/applications`).expect(401);
    const student = await h.loginWeb('student');
    await student.agent.get(`${ADMIN}/applications`).expect(401); // website cookie ≠ admin cookie
    const finance = await h.loginAdmin('finance');
    await finance.agent.get(`${ADMIN}/applications`).expect(403);
    const verifier = await h.loginAdmin('verifier');
    await verifier.agent.get(`${ADMIN}/applications`).expect(200);
    await verifier.agent.get(`${ADMIN}/audit`).expect(403);
    const superAdmin = await h.loginAdmin('super_admin');
    await superAdmin.agent.get(`${ADMIN}/applications`).expect(200);
    await superAdmin.agent.get(`${ADMIN}/audit`).expect(200);
  });
});

describe('queue and detail', () => {
  it('lists submitted applications with names resolved, never drafts', async () => {
    const draft = await h.loginWeb('mentor');
    await draft.agent.put(APP).send({ kind: 'professor' }).expect(200);
    const { applicationId } = await submitted();

    const verifier = await h.loginAdmin('verifier');
    const list = await verifier.agent.get(`${ADMIN}/applications?status=submitted`).expect(200);
    const item = list.body.data.items.find((i: { id: string }) => i.id === applicationId);
    expect(item).toMatchObject({ status: 'submitted', kind: 'graduate', major: 'هندسة الاتصالات' });
    expect(item.faculty).toContain('·');
    expect(list.body.data.counts.submitted).toBeGreaterThan(0);
    expect(list.body.data.counts.draft).toBeUndefined();

    const detail = await verifier.agent.get(`${ADMIN}/applications/${applicationId}`).expect(200);
    expect(detail.body.data.application).toMatchObject({
      applicant: { fullName: 'سارة عبد الرحمن' },
      documents: [{ kind: 'graduation_certificate' }, { kind: 'national_id_front' }],
      history: [{ action: 'mentor_application.submit' }],
    });
    expect(detail.body.data.application.university).toBeTruthy();
  });
});

describe('documents', () => {
  it('returns the decrypted file with no-cache headers, and audits every view', async () => {
    const { applicationId } = await submitted();
    const verifier = await h.loginAdmin('verifier');
    const detail = await verifier.agent.get(`${ADMIN}/applications/${applicationId}`).expect(200);
    const id = detail.body.data.application.documents.find(
      (d: { kind: string }) => d.kind === 'national_id_front',
    ).id as string;

    const res = await verifier.agent
      .get(`${ADMIN}/applications/${applicationId}/documents/${id}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((res.body as Buffer).equals(JPEG)).toBe(true);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toContain('no-store');

    const views = await h.db.auditLog.count({
      where: { action: 'mentor_document.view', entityId: id },
    });
    expect(views).toBe(1);

    // A document id from another application is not reachable through this one.
    const other = await submitted();
    await verifier.agent
      .get(`${ADMIN}/applications/${other.applicationId}/documents/${id}`)
      .expect(404);
  });
});

describe('decisions', () => {
  it('approves: creates a listed mentor with offerings and topics, and notifies', async () => {
    const mentor = await submitted();
    const verifier = await h.loginAdmin('verifier');
    await verifier.agent.post(`${ADMIN}/applications/${mentor.applicationId}/start`).expect(200);
    await verifier.agent.post(`${ADMIN}/applications/${mentor.applicationId}/start`).expect(409);

    const res = await verifier.agent
      .post(`${ADMIN}/applications/${mentor.applicationId}/decision`)
      .send({ decision: 'approve' })
      .expect(200);
    expect(res.body.data.application).toMatchObject({
      status: 'approved',
      reviewer: 'Admin verifier',
    });

    const profile = await h.db.mentor.findUniqueOrThrow({
      where: { userId: mentor.userId },
      include: { offerings: true, topics: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(profile).toMatchObject({
      kind: 'graduate',
      basePricePiasters: 30_000,
      majorLabel: 'هندسة الاتصالات',
      isListed: true,
    });
    expect(profile.offerings.map((o) => o.kind).sort()).toEqual([
      'comparison',
      'consultation',
      'quick_call',
    ]);
    expect(profile.topics.map((t) => t.label)).toEqual([
      'الإعدادي',
      'التدريب الصيفي',
      'الفرق بين الأقسام',
    ]);
    const note = await h.db.notification.findFirst({ where: { userId: mentor.userId } });
    expect(note?.type).toBe('mentor_application.approved');

    // The applicant now sees the approved application and cannot edit it.
    const mine = await mentor.agent.get(APP).expect(200);
    expect(mine.body.data.application.status).toBe('approved');
    await mentor.agent.put(APP).send({ major: 'x y' }).expect(409);

    // Decided applications cannot be decided again.
    await verifier.agent
      .post(`${ADMIN}/applications/${mentor.applicationId}/decision`)
      .send({ decision: 'reject', note: 'متأخر' })
      .expect(409);
  });

  it('requires a note to reject or request changes, and sends the note to the applicant', async () => {
    const mentor = await submitted();
    const verifier = await h.loginAdmin('verifier');
    const bad = await verifier.agent
      .post(`${ADMIN}/applications/${mentor.applicationId}/decision`)
      .send({ decision: 'request_changes' })
      .expect(400);
    expect(bad.body.error.fields.note).toBeTruthy();

    await verifier.agent
      .post(`${ADMIN}/applications/${mentor.applicationId}/decision`)
      .send({ decision: 'request_changes', note: 'صورة البطاقة مش واضحة' })
      .expect(200);
    const mine = await mentor.agent.get(APP).expect(200);
    expect(mine.body.data.application).toMatchObject({
      status: 'changes_requested',
      decisionNote: 'صورة البطاقة مش واضحة',
    });

    // Resubmitted, then rejected: a final decision with the reviewer recorded.
    await mentor.agent.post(`${APP}/submit`).expect(200);
    await verifier.agent
      .post(`${ADMIN}/applications/${mentor.applicationId}/decision`)
      .send({ decision: 'reject', note: 'المستندات مش مطابقة' })
      .expect(200);
    const row = await h.db.mentorApplication.findUniqueOrThrow({
      where: { id: mentor.applicationId },
    });
    expect(row.status).toBe('rejected');
    expect(row.decidedAt).not.toBeNull();
    expect(await h.db.mentor.count({ where: { userId: mentor.userId } })).toBe(0);

    const superAdmin = await h.loginAdmin('super_admin');
    const audit = await superAdmin.agent
      .get(`${ADMIN}/audit?entityType=mentor_application&action=mentor_application.`)
      .expect(200);
    const actions = (audit.body.data.items as { action: string; entityId: string }[])
      .filter((a) => a.entityId === mentor.applicationId)
      .map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'mentor_application.submit',
        'mentor_application.request_changes',
        'mentor_application.reject',
      ]),
    );
  });

  it('lets only one of two concurrent decisions win', async () => {
    const mentor = await submitted();
    const a = await h.loginAdmin('verifier');
    const b = await h.loginAdmin('verifier');
    const url = `${ADMIN}/applications/${mentor.applicationId}/decision`;
    const results = await Promise.all([
      a.agent.post(url).send({ decision: 'approve' }),
      b.agent.post(url).send({ decision: 'reject', note: 'لأ' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const row = await h.db.mentorApplication.findUniqueOrThrow({
      where: { id: mentor.applicationId },
    });
    expect(await h.db.mentor.count({ where: { userId: mentor.userId } })).toBe(
      row.status === 'approved' ? 1 : 0,
    );
  });
});
