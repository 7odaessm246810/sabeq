/**
 * Mentor profiles (Phase 12): public profile and lists, the mentor's own profile and photo,
 * students' saved mentors. Shared test database — mentors made here use fresh accounts.
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

/** A mentor as an approved application leaves it (Phase 10), with a signed-in agent. */
async function makeMentor(opts: { listed?: boolean; price?: number } = {}) {
  const session = await h.loginWeb('mentor');
  const faculty = await h.db.faculty.findFirstOrThrow({
    where: { university: { slug: 'cairo' }, kind: { slug: 'eng' } },
    include: { departments: { where: { isActive: true }, take: 1 } },
  });
  const slug = `m-test-${session.userId.slice(-10)}`;
  await h.db.user.update({ where: { id: session.userId }, data: { fullName: 'سارة أحمد علي' } });
  await h.db.mentor.create({
    data: {
      userId: session.userId,
      slug,
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'هندسة الحاسبات',
      graduationYear: 2024,
      basePricePiasters: (opts.price ?? 250) * 100,
      isListed: opts.listed ?? true,
      listedAt: new Date(),
      offerings: {
        create: [
          { kind: 'consultation', durationMin: 45, medium: 'video' },
          { kind: 'comparison', durationMin: 60, medium: 'video' },
          { kind: 'quick_call', durationMin: 20, medium: 'audio' },
        ],
      },
      topics: { create: [{ label: 'الإعدادي', sortOrder: 0 }] },
    },
  });
  return { ...session, slug, faculty, department: faculty.departments[0] };
}

describe('public profile', () => {
  it('shows a listed mentor with derived prices and no invented rating', async () => {
    const m = await makeMentor();
    const res = await request(h.app).get(`/api/v1/mentors/${m.slug}`).expect(200);
    const mentor = res.body.data.mentor;
    expect(mentor).toMatchObject({
      slug: m.slug,
      name: 'سارة أحمد علي',
      kindLabel: 'خريج',
      major: 'هندسة الحاسبات',
      faculty: { name: 'كلية الهندسة' },
      university: { slug: 'cairo' },
      field: { slug: 'eng' },
      rating: null,
      priceEgp: 250,
      reviews: [],
    });
    expect(mentor.tone).toBeGreaterThanOrEqual(1);
    expect(mentor.offerings).toEqual([
      expect.objectContaining({ kind: 'consultation', durationMin: 45, priceEgp: 250 }),
      expect.objectContaining({ kind: 'comparison', durationMin: 60, priceEgp: 330 }),
      expect.objectContaining({ kind: 'quick_call', durationMin: 20, priceEgp: 130 }),
    ]);
    // Nothing private leaks: no phone, no user id.
    expect(JSON.stringify(mentor)).not.toMatch(/\+20|userId/);
  });

  it('hides unlisted and suspended mentors', async () => {
    const hidden = await makeMentor({ listed: false });
    await request(h.app).get(`/api/v1/mentors/${hidden.slug}`).expect(404);
    const suspended = await makeMentor();
    await h.db.user.update({ where: { id: suspended.userId }, data: { status: 'suspended' } });
    await request(h.app).get(`/api/v1/mentors/${suspended.slug}`).expect(404);
    const list = await request(h.app)
      .get('/api/v1/mentors')
      .query({ faculty: suspended.faculty.id, pageSize: 24 })
      .expect(200);
    const slugs = (list.body.data.results as { slug: string }[]).map((r) => r.slug);
    expect(slugs).not.toContain(hidden.slug);
    expect(slugs).not.toContain(suspended.slug);
  });

  it('lists mentors by field, faculty and university, sorted by price', async () => {
    const cheap = await makeMentor({ price: 100 });
    const res = await request(h.app)
      .get('/api/v1/mentors')
      .query({ field: 'eng', university: 'cairo', sort: 'price_asc', pageSize: 24 })
      .expect(200);
    const { results, total } = res.body.data as {
      results: { slug: string; priceEgp: number; field: { slug: string } }[];
      total: number;
    };
    expect(total).toBeGreaterThan(0);
    expect(results.every((r) => r.field.slug === 'eng')).toBe(true);
    expect(results[0]?.priceEgp).toBe(100);
    expect(results.map((r) => r.slug)).toContain(cheap.slug);
    await request(h.app).get('/api/v1/mentors').query({ sort: 'cheapest' }).expect(400);
  });
});

describe("the mentor's own profile", () => {
  it('is for mentors with an approved profile only', async () => {
    await request(h.app).get('/api/v1/me/mentor').expect(401);
    const student = await h.loginWeb('student');
    await student.agent.get('/api/v1/me/mentor').expect(403);
    const applicant = await h.loginWeb('mentor');
    await applicant.agent.get('/api/v1/me/mentor').expect(404);
  });

  it('edits what the mentor owns, never the verified facts', async () => {
    const m = await makeMentor();
    const res = await m.agent
      .patch('/api/v1/me/mentor')
      .send({
        bio: '  خريج هندسة حاسبات، بشتغل مهندس برمجيات.  ',
        city: 'الجيزة',
        topics: ['الإعدادي وأول ترم', 'حاسبات ولا اتصالات؟'],
        basePriceEgp: 300,
        acceptsBookings: false,
        ...(m.department ? { departmentId: m.department.id } : {}),
      })
      .expect(200);
    expect(res.body.data.mentor).toMatchObject({
      bio: 'خريج هندسة حاسبات، بشتغل مهندس برمجيات.',
      city: 'الجيزة',
      topics: ['الإعدادي وأول ترم', 'حاسبات ولا اتصالات؟'],
      basePriceEgp: 300,
      acceptsBookings: false,
      verified: { faculty: 'كلية الهندسة', major: 'هندسة الحاسبات', graduationYear: 2024 },
    });
    const pub = (await request(h.app).get(`/api/v1/mentors/${m.slug}`)).body.data.mentor;
    expect(pub).toMatchObject({ priceEgp: 300, city: 'الجيزة', acceptsBookings: false });

    await m.agent.patch('/api/v1/me/mentor').send({ majorLabel: 'طب' }).expect(400);
    await m.agent.patch('/api/v1/me/mentor').send({ basePriceEgp: 255 }).expect(400);
    await m.agent.patch('/api/v1/me/mentor').send({ basePriceEgp: 900 }).expect(400);
    await m.agent
      .patch('/api/v1/me/mentor')
      .send({ topics: ['أ ب', 'أ ب'] })
      .expect(400);
    const other = await h.db.department.findFirstOrThrow({
      where: { faculty: { kind: { slug: 'med' } } },
    });
    await m.agent.patch('/api/v1/me/mentor').send({ departmentId: other.id }).expect(400);
  });

  it('uploads a profile photo that shows publicly, and removes it', async () => {
    const m = await makeMentor();
    await m.agent
      .put('/api/v1/me/mentor/photo')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('not an image at all'))
      .expect(400);
    const photo = (
      await m.agent
        .put('/api/v1/me/mentor/photo')
        .set('Content-Type', 'image/png')
        .send(PNG)
        .expect(200)
    ).body.data.photo as string;
    expect(photo).toMatch(/^\/api\/v1\/media\/avatars\/[a-f0-9-]+\.png$/);
    const img = await request(h.app).get(photo).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await request(h.app).get(`/api/v1/mentors/${m.slug}`)).body.data.mentor.photo).toBe(
      photo,
    );
    await m.agent.delete('/api/v1/me/mentor/photo').expect(200);
    await request(h.app).get(photo).expect(404);
  });
});

describe('saved mentors', () => {
  it('lets a student save and unsave a mentor', async () => {
    const m = await makeMentor();
    const student = await h.loginWeb('student');
    await request(h.app).put(`/api/v1/me/saved-mentors/${m.slug}`).expect(401);
    await m.agent.put(`/api/v1/me/saved-mentors/${m.slug}`).expect(403);

    await student.agent.put(`/api/v1/me/saved-mentors/${m.slug}`).expect(200);
    await student.agent.put(`/api/v1/me/saved-mentors/${m.slug}`).expect(200); // idempotent
    let saved = (await student.agent.get('/api/v1/me/saved-mentors')).body.data.mentors;
    expect(saved.map((s: { slug: string }) => s.slug)).toEqual([m.slug]);

    await student.agent.delete(`/api/v1/me/saved-mentors/${m.slug}`).expect(200);
    saved = (await student.agent.get('/api/v1/me/saved-mentors')).body.data.mentors;
    expect(saved).toEqual([]);
    await student.agent.put('/api/v1/me/saved-mentors/m-nobody').expect(404);
  });
});
