/**
 * Faculty search (/explore) and admin management of universities and faculties with logos.
 * Shared test database — every row created here is removed before the test ends.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Result {
  id: string;
  name: string;
  logo: string | null;
  governorate: string | null;
  university: { slug: string; name: string; type: string };
  kind: { slug: string; category: string };
}
interface Search {
  total: number;
  results: Result[];
  facets: {
    governorates: { name: string; count: number }[];
    universities: { slug: string; count: number }[];
    categories: { category: string; count: number }[];
  };
}

const search = async (query: Record<string, string>) =>
  (await request(h.app).get('/api/v1/catalog/faculties').query(query).expect(200)).body
    .data as Search;

describe('faculty search', () => {
  it('finds a faculty by what students type, whatever the spelling', async () => {
    for (const q of ['هندسة القاهرة', 'هندسه القاهره', 'كلية الهندسة جامعة القاهرة']) {
      const top = (await search({ q })).results[0];
      expect(top).toMatchObject({ university: { slug: 'cairo' }, kind: { slug: 'eng' } });
    }
    const assiut = await search({ q: 'طب اسيوط' });
    expect(assiut.results[0]).toMatchObject({
      university: { slug: 'assiut' },
      kind: { slug: 'med' },
    });
    // Al-Azhar's medicine faculties in Assiut are found by their town too.
    expect(assiut.results.some((r) => r.name === 'كلية الطب (بنات) بأسيوط')).toBe(true);
    expect((await search({ q: 'كلية غير موجودة خالص' })).total).toBe(0);
  });

  it('narrows step by step, and each facet only offers what still has results', async () => {
    const all = await search({});
    expect(all.total).toBeGreaterThan(600);
    expect(all.results).toHaveLength(24);

    const gov = await search({ governorate: 'أسيوط' });
    expect(gov.results.every((r) => r.governorate === 'أسيوط')).toBe(true);
    const unis = gov.facets.universities.map((u) => u.slug);
    expect(unis).toEqual(expect.arrayContaining(['assiut', 'azhar']));
    expect(unis).not.toContain('cairo');
    // The governorate facet ignores its own filter, so the student can switch.
    expect(gov.facets.governorates.length).toBeGreaterThan(10);

    const medical = await search({
      governorate: 'أسيوط',
      university: 'assiut',
      category: 'medical',
    });
    expect(medical.total).toBeGreaterThan(2);
    expect(medical.results.every((r) => r.kind.category === 'medical')).toBe(true);

    await request(h.app).get('/api/v1/catalog/faculties').query({ category: 'magic' }).expect(400);
  });

  it('serves one faculty page and hides inactive ones', async () => {
    const top = (await search({ q: 'هندسة القاهرة' })).results[0];
    const res = await request(h.app).get(`/api/v1/catalog/faculties/${top?.id}`).expect(200);
    expect(res.body.data.faculty).toMatchObject({
      name: 'كلية الهندسة',
      university: { slug: 'cairo', type: 'public' },
      kind: { slug: 'eng', studyYears: 5 },
      sources: { accreditation: { latestDecision: expect.any(String) } },
    });
    expect(res.body.data.faculty.departments.length).toBeGreaterThan(5);
    await request(h.app)
      .get('/api/v1/catalog/faculties/00000000-0000-7000-8000-000000000000')
      .expect(404);
  });
});

describe('admin management', () => {
  it('is for super admins and support only', async () => {
    await request(h.app).post('/api/v1/admin/catalog/universities').send({}).expect(401);
    const finance = await h.loginAdmin('finance');
    await finance.agent.post('/api/v1/admin/catalog/universities').send({}).expect(403);
  });

  it('adds a university and a faculty with logos, shows them at once, and audits it', async () => {
    const admin = await h.loginAdmin('support');
    const base = '/api/v1/admin/catalog';

    await admin.agent
      .post(`${base}/universities`)
      .send({ nameAr: 'ج', type: 'private', governorate: 'مش محافظة' })
      .expect(400);
    const created = await admin.agent
      .post(`${base}/universities`)
      .send({
        nameAr: 'جامعة الاختبار الخاصة',
        nameEn: 'Test Private University',
        type: 'private',
        governorate: 'الإسماعيلية',
        website: 'https://example.edu.eg',
      })
      .expect(201);
    const uni = created.body.data.university as { id: string; slug: string };
    expect(uni.slug).toBe('test-private-university');

    try {
      // Logo: only real images, never what the client claims.
      await admin.agent
        .put(`${base}/universities/${uni.id}/logo`)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('<svg onload="alert(1)"></svg>'))
        .expect(400);
      const logo = (
        await admin.agent
          .put(`${base}/universities/${uni.id}/logo`)
          .set('Content-Type', 'image/png')
          .send(PNG)
          .expect(200)
      ).body.data.logo as string;
      expect(logo).toMatch(/^\/api\/v1\/media\/logos\/[a-f0-9-]+\.png$/);
      const img = await request(h.app).get(logo).expect(200);
      expect(img.headers['content-type']).toBe('image/png');
      expect(img.headers['cache-control']).toContain('immutable');
      await request(h.app).get('/api/v1/media/logos/..%2F..%2Fpackage.json').expect(404);

      const kinds = (await admin.agent.get(`${base}/kinds`)).body.data.kinds as {
        id: string;
        slug: string;
      }[];
      const eng = kinds.find((k) => k.slug === 'eng');
      const faculty = (
        await admin.agent
          .post(`${base}/faculties`)
          .send({
            universityId: uni.id,
            kindId: eng?.id,
            nameAr: 'كلية الهندسة والتكنولوجيا',
            city: 'الإسماعيلية الجديدة',
            accreditationStatus: 'accredited',
            accreditedAt: '2026-01-01',
            accreditationExpiresAt: '2025-01-01',
          })
          .expect(400)
      ).body;
      expect(faculty.error.fields.accreditationExpiresAt).toBeTruthy();
      const f = (
        await admin.agent
          .post(`${base}/faculties`)
          .send({
            universityId: uni.id,
            kindId: eng?.id,
            nameAr: 'كلية الهندسة والتكنولوجيا',
            city: 'الإسماعيلية الجديدة',
            about: 'برامج بالساعات المعتمدة.',
          })
          .expect(201)
      ).body.data.faculty as { id: string };
      await admin.agent
        .post(`${base}/faculties`)
        .send({ universityId: uni.id, kindId: eng?.id, nameAr: 'كلية الهندسة والتكنولوجيا' })
        .expect(409);

      // Search sees it immediately, with the university's logo until the faculty has its own.
      const found = (await search({ q: 'هندسة الاختبار الخاصة' })).results[0];
      expect(found).toMatchObject({ id: f.id, logo, governorate: 'الإسماعيلية' });

      await admin.agent
        .post(`${base}/faculties/${f.id}/cutoffs`)
        .send({
          year: 2026,
          phase: 1,
          track: 'science_math',
          minScore: 280,
          maxScore: 320,
          sourceUrl: 'https://example.edu.eg/tansik',
        })
        .expect(201);
      await admin.agent
        .patch(`${base}/faculties/${f.id}`)
        .send({ website: 'https://eng.example.edu.eg', isActive: false })
        .expect(200);
      await request(h.app).get(`/api/v1/catalog/faculties/${f.id}`).expect(404);

      // A university with faculties cannot be deleted; an unreferenced faculty can.
      await admin.agent.delete(`${base}/universities/${uni.id}`).expect(409);
      await admin.agent.delete(`${base}/faculties/${f.id}`).expect(200);

      const actions = await h.db.auditLog.findMany({
        where: { actorUserId: admin.userId },
        select: { action: true },
      });
      expect(actions.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          'catalog.university.create',
          'catalog.university.logo',
          'catalog.faculty.create',
          'catalog.cutoff.save',
          'catalog.faculty.update',
          'catalog.faculty.delete',
        ]),
      );
    } finally {
      await h.db.faculty.deleteMany({ where: { universityId: uni.id } });
      await admin.agent.delete(`${base}/universities/${uni.id}`).expect(200);
    }
  });

  it('refuses to delete a faculty that mentors depend on', async () => {
    const admin = await h.loginAdmin('super_admin');
    const law = await h.db.faculty.findFirstOrThrow({ where: { kind: { slug: 'law' } } });
    const { userId } = await h.loginWeb('mentor');
    await h.db.mentor.create({
      data: {
        userId,
        slug: `m-del-${userId.slice(-8)}`,
        kind: 'graduate',
        facultyId: law.id,
        majorLabel: 'قانون',
      },
    });
    const res = await admin.agent.delete(`/api/v1/admin/catalog/faculties/${law.id}`).expect(409);
    expect(res.body.error.message).toContain('اخفيها');
  });

  it('marks edited rows so the research seed leaves them alone', async () => {
    const admin = await h.loginAdmin('support');
    const assiut = await h.db.university.findUniqueOrThrow({ where: { slug: 'assiut' } });
    await admin.agent
      .patch(`/api/v1/admin/catalog/universities/${assiut.id}`)
      .send({ website: 'https://www.aun.edu.eg' })
      .expect(200);
    const after = await h.db.university.findUniqueOrThrow({ where: { id: assiut.id } });
    expect(after.adminEditedAt).toBeInstanceOf(Date);
    await h.db.university.update({
      where: { id: assiut.id },
      data: { website: assiut.website, adminEditedAt: null },
    });
  });
});
