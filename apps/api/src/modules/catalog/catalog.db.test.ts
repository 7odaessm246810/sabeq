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
    // Every public university but a handful has an engineering faculty (MoHE list, Phase 11).
    expect(eng?.universities.length).toBeGreaterThan(20);
    expect(eng?.universities).toContain('cairo');
  });

  it('lists every university offering a faculty, with accreditation and cutoffs', async () => {
    const med = await kind('med');
    interface Offering {
      name: string;
      university: { slug: string; type: string };
      accreditation: { status: string; expiresAt: string | null; programmes: unknown[] };
      cutoffs: { year: number; track: string; minScore: number; maxScore: number }[];
    }
    const offerings = med.faculties as Offering[];
    expect(offerings.length).toBeGreaterThan(30);
    const cairo = offerings.find((o) => o.university.slug === 'cairo');
    expect(cairo).toMatchObject({
      name: expect.stringContaining('الطب'),
      university: { type: 'public' },
    });
    expect(['accredited', 'conditional', 'not_accredited', 'unknown']).toContain(
      cairo?.accreditation.status,
    );
    expect(cairo?.cutoffs[0]).toMatchObject({ year: 2026, track: 'science_bio', maxScore: 320 });
    // Al-Azhar faculties are listed per campus and gender.
    expect(offerings.some((o) => o.name === 'كلية الطب (بنات) بالقاهرة')).toBe(true);
    expect(med.sources.accreditation.latestDecision).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a faculty page with merged departments and no placeholder insights', async () => {
    const eng = await kind('eng');
    expect(eng).toMatchObject({ fullName: 'كلية الهندسة', studyYears: 5 });
    // Placeholder quotes are hidden by the seed; only quotes added by admins are published.
    expect(eng.insights).toEqual([]);
    // The same department at several universities appears once.
    const names = (eng.departments as { name: string }[]).map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    // Each university's departments come with the page they were taken from.
    const cairo = (
      eng.faculties as {
        university: { slug: string };
        departments: { name: string }[];
        departmentsSource: string | null;
      }[]
    ).find((o) => o.university.slug === 'cairo');
    expect(cairo?.departments.map((d) => d.name)).toContain('هندسة الحاسبات');
    expect(cairo?.departmentsSource).toMatch(/^https:\/\/ar\.wikipedia\.org\//);
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
      .send({ nameAr: 'قسم اختبار الإدارة' })
      .expect(201);
    await admin.agent
      .post(`/api/v1/admin/catalog/faculties/${faculty.id}/departments`)
      .send({ nameAr: 'قسم اختبار الإدارة' })
      .expect(409);
    expect((await kind('media')).departments.map((d: { name: string }) => d.name)).toContain(
      'قسم اختبار الإدارة',
    );
    const fresh = (await admin.agent.get(`/api/v1/admin/catalog/kinds/${media.id}`)).body.data.kind;
    const dept = fresh.faculties[0].departments.find(
      (d: { nameAr: string }) => d.nameAr === 'قسم اختبار الإدارة',
    );
    await admin.agent
      .patch(`/api/v1/admin/catalog/departments/${dept.id}`)
      .send({ isActive: false })
      .expect(200);
    expect((await kind('media')).departments.map((d: { name: string }) => d.name)).not.toContain(
      'قسم اختبار الإدارة',
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
    const capital = unis.find((u) => u.slug === 'capital');
    await admin.agent
      .patch(`/api/v1/admin/catalog/universities/${capital?.id}`)
      .send({ isActive: false })
      .expect(200);
    try {
      const pub = (await request(h.app).get('/api/v1/catalog/universities')).body.data.universities;
      expect(pub.map((u: { slug: string }) => u.slug)).not.toContain('capital');
      expect((await kinds()).every((k) => !k.universities.includes('capital'))).toBe(true);
    } finally {
      await admin.agent
        .patch(`/api/v1/admin/catalog/universities/${capital?.id}`)
        .send({ isActive: true })
        .expect(200);
    }
  });
});
