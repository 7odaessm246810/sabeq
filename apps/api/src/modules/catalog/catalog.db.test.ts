/**
 * Catalog: public reads for /explore and faculty pages, and admin curation (audited).
 * Shared test database — every change made here is undone before the test ends.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

interface KindSummary {
  slug: string;
  name: string;
  mentorCount: number;
  universities: string[];
  departments: string[];
}

const kinds = async () =>
  (await request(h.app).get('/api/v1/catalog/faculty-kinds').expect(200)).body.data
    .kinds as KindSummary[];
const kind = async (slug: string) =>
  (await request(h.app).get(`/api/v1/catalog/faculty-kinds/${slug}`).expect(200)).body.data.kind;

describe('public catalog', () => {
  it('lists faculty kinds with universities, departments and cache headers', async () => {
    const res = await request(h.app).get('/api/v1/catalog/faculty-kinds').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=300');
    const eng = (res.body.data.kinds as KindSummary[]).find((k) => k.slug === 'eng');
    expect(eng).toMatchObject({ name: 'الهندسة', mentorCount: expect.any(Number) });
    expect(eng?.universities.length).toBeGreaterThan(1);
    expect(eng?.departments).toContain('هندسة الحاسبات');
  });

  it('returns a faculty page with merged departments and published insights', async () => {
    const eng = await kind('eng');
    expect(eng).toMatchObject({ fullName: 'كلية الهندسة', studyYears: 5 });
    expect(eng.insights.length).toBeGreaterThan(0);
    // The same department at six universities appears once.
    const names = (eng.departments as { name: string }[]).map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    await request(h.app).get('/api/v1/catalog/faculty-kinds/nope').expect(404);
    await request(h.app).get('/api/v1/catalog/faculty-kinds/../x').expect(404);
  });

  it('counts only listed mentors', async () => {
    const before = (await kinds()).find((k) => k.slug === 'law')?.mentorCount ?? 0;
    const law = await h.db.faculty.findFirstOrThrow({ where: { kind: { slug: 'law' } } });
    const make = async (isListed: boolean) => {
      const { userId } = await h.loginWeb('mentor');
      await h.db.mentor.create({
        data: {
          userId,
          slug: `m-test-${userId.slice(-8)}`,
          kind: 'graduate',
          facultyId: law.id,
          majorLabel: 'قانون',
          isListed,
        },
      });
    };
    await make(true);
    await make(false);
    expect((await kinds()).find((k) => k.slug === 'law')?.mentorCount).toBe(before + 1);
  });
});

describe('admin curation', () => {
  it('is for super admins and support only', async () => {
    await request(h.app).get('/api/v1/admin/catalog/kinds').expect(401);
    const finance = await h.loginAdmin('finance');
    await finance.agent.get('/api/v1/admin/catalog/kinds').expect(403);
    const support = await h.loginAdmin('support');
    await support.agent.get('/api/v1/admin/catalog/kinds').expect(200);
  });

  it('edits a faculty, its insights and departments, and audits each change', async () => {
    const admin = await h.loginAdmin('support');
    const list = (await admin.agent.get('/api/v1/admin/catalog/kinds').expect(200)).body.data.kinds;
    const media = list.find((k: { slug: string }) => k.slug === 'media');
    const original = (await admin.agent.get(`/api/v1/admin/catalog/kinds/${media.id}`)).body.data
      .kind;

    // Texts
    await admin.agent
      .patch(`/api/v1/admin/catalog/kinds/${media.id}`)
      .send({ summary: '  صحافة،   إذاعة ' })
      .expect(200);
    expect((await kind('media')).summary).toBe('صحافة، إذاعة');
    await admin.agent
      .patch(`/api/v1/admin/catalog/kinds/${media.id}`)
      .send({ summary: '', studyYears: 12 })
      .expect(400);

    // Insights: add, hide, delete
    const added = await admin.agent
      .post(`/api/v1/admin/catalog/kinds/${media.id}/insights`)
      .send({ quote: '«أهم حاجة التدريب بدري.»' })
      .expect(201);
    const insight = (added.body.data.kind.insights as { id: string; quote: string }[]).find(
      (i) => i.quote === '«أهم حاجة التدريب بدري.»',
    );
    expect((await kind('media')).insights).toContain('«أهم حاجة التدريب بدري.»');
    await admin.agent
      .patch(`/api/v1/admin/catalog/insights/${insight?.id}`)
      .send({ isPublished: false })
      .expect(200);
    expect((await kind('media')).insights).not.toContain('«أهم حاجة التدريب بدري.»');
    await admin.agent.delete(`/api/v1/admin/catalog/insights/${insight?.id}`).expect(200);

    // Departments: add, refuse duplicates, deactivate
    const faculty = original.faculties[0];
    await admin.agent
      .post(`/api/v1/admin/catalog/faculties/${faculty.id}/departments`)
      .send({ nameAr: 'إعلام رقمي' })
      .expect(201);
    await admin.agent
      .post(`/api/v1/admin/catalog/faculties/${faculty.id}/departments`)
      .send({ nameAr: 'إعلام رقمي' })
      .expect(409);
    expect((await kind('media')).departments.map((d: { name: string }) => d.name)).toContain(
      'إعلام رقمي',
    );
    const fresh = (await admin.agent.get(`/api/v1/admin/catalog/kinds/${media.id}`)).body.data.kind;
    const dept = fresh.faculties[0].departments.find(
      (d: { nameAr: string }) => d.nameAr === 'إعلام رقمي',
    );
    await admin.agent
      .patch(`/api/v1/admin/catalog/departments/${dept.id}`)
      .send({ isActive: false })
      .expect(200);
    expect((await kind('media')).departments.map((d: { name: string }) => d.name)).not.toContain(
      'إعلام رقمي',
    );

    // Undo the text change; the department stays inactive (it never existed for the public).
    await admin.agent
      .patch(`/api/v1/admin/catalog/kinds/${media.id}`)
      .send({ summary: original.summary })
      .expect(200);

    const actions = await h.db.auditLog.findMany({
      where: { actorUserId: admin.userId },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'catalog.kind.update',
        'catalog.insight.create',
        'catalog.insight.update',
        'catalog.insight.delete',
        'catalog.department.create',
        'catalog.department.update',
      ]),
    );
  });

  it('hides a deactivated university everywhere public', async () => {
    const admin = await h.loginAdmin('super_admin');
    const unis = (await admin.agent.get('/api/v1/admin/catalog/universities').expect(200)).body.data
      .universities as { id: string; slug: string }[];
    const helwan = unis.find((u) => u.slug === 'helwan');
    await admin.agent
      .patch(`/api/v1/admin/catalog/universities/${helwan?.id}`)
      .send({ isActive: false })
      .expect(200);
    try {
      const pub = (await request(h.app).get('/api/v1/catalog/universities')).body.data.universities;
      expect(pub.map((u: { slug: string }) => u.slug)).not.toContain('helwan');
      expect((await kinds()).every((k) => !k.universities.includes('helwan'))).toBe(true);
    } finally {
      await admin.agent
        .patch(`/api/v1/admin/catalog/universities/${helwan?.id}`)
        .send({ isActive: true })
        .expect(200);
    }
  });
});
