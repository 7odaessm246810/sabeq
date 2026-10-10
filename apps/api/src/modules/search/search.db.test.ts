/**
 * Discovery (Phase 13): mentor filters and facets, search suggestions, and the week's popular terms.
 * Shared test database; Redis keys written here are removed at the end.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';
import { POPULAR_MIN_VISITORS } from './search.service.js';

const h = createHarness();
afterAll(async () => {
  const keys = await h.redis.keys('search:*');
  if (keys.length) await h.redis.del(...keys);
  await h.close();
});

async function mentor(opts: {
  name: string;
  university: string;
  kind: string;
  price: number;
  rating?: number;
  accepts?: boolean;
}) {
  const s = await h.loginWeb('mentor');
  const faculty = await h.db.faculty.findFirstOrThrow({
    where: { university: { slug: opts.university }, kind: { slug: opts.kind } },
  });
  const slug = `m-disc-${s.userId.slice(-10)}`;
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: opts.name } });
  await h.db.mentor.create({
    data: {
      userId: s.userId,
      slug,
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'تخصص للاختبار',
      basePricePiasters: opts.price * 100,
      isListed: true,
      listedAt: new Date(),
      acceptsBookings: opts.accepts ?? true,
      ratingAvg: opts.rating ?? 0,
      ratingCount: opts.rating ? 10 : 0,
      topics: { create: [{ label: 'سنة الامتياز', sortOrder: 0 }] },
    },
  });
  return slug;
}

const list = async (query: Record<string, string>) =>
  (
    await request(h.app)
      .get('/api/v1/mentors')
      .query({ pageSize: '24', ...query })
      .expect(200)
  ).body.data as {
    total: number;
    results: {
      slug: string;
      priceEgp: number;
      rating: number | null;
      university: { slug: string };
    }[];
    facets: {
      fields: { slug: string; count: number }[];
      universities: { slug: string; count: number }[];
    };
  };

describe('mentor discovery', () => {
  it('finds mentors by name, study or topic, whatever the spelling', async () => {
    const slug = await mentor({
      name: 'زينب الشافعي',
      university: 'tanta',
      kind: 'med',
      price: 200,
    });
    for (const q of ['زينب', 'زينب طنطا', 'طب طنطا', 'الامتياز']) {
      expect((await list({ q })).results.map((r) => r.slug)).toContain(slug);
    }
    expect((await list({ q: 'زينب أسيوط' })).total).toBe(0);
  });

  it('filters by universities, rating, price and availability, with live facets', async () => {
    const top = await mentor({
      name: 'م أ',
      university: 'zagazig',
      kind: 'pharm',
      price: 400,
      rating: 4.9,
    });
    const cheap = await mentor({
      name: 'م ب',
      university: 'alexandria',
      kind: 'pharm',
      price: 100,
    });
    const closed = await mentor({
      name: 'م ج',
      university: 'alexandria',
      kind: 'pharm',
      price: 150,
      accepts: false,
    });

    const both = await list({ field: 'pharm', university: 'zagazig,alexandria' });
    expect(both.results.map((r) => r.slug)).toEqual(expect.arrayContaining([top, cheap, closed]));
    expect(both.results.every((r) => ['zagazig', 'alexandria'].includes(r.university.slug))).toBe(
      true,
    );
    // The university facet ignores its own filter, so other universities stay selectable.
    expect(both.facets.universities.length).toBeGreaterThanOrEqual(2);

    const rated = await list({ field: 'pharm', minRating: '4.7' });
    expect(rated.results.map((r) => r.slug)).toContain(top);
    expect(rated.results.map((r) => r.slug)).not.toContain(cheap); // no reviews yet ≠ rated

    const affordable = await list({ field: 'pharm', maxPrice: '150' });
    expect(affordable.results.every((r) => r.priceEgp <= 150)).toBe(true);

    const open = await list({ field: 'pharm', available: '1' });
    expect(open.results.map((r) => r.slug)).not.toContain(closed);

    const sorted = await list({ field: 'pharm', sort: 'price_asc' });
    const prices = sorted.results.map((r) => r.priceEgp);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    await request(h.app).get('/api/v1/mentors').query({ university: 'Bad Slug' }).expect(400);
  });
});

describe('search suggestions', () => {
  it('suggests fields, faculties and mentors while typing', async () => {
    const res = await request(h.app).get('/api/v1/search/suggest').query({ q: 'هندس' }).expect(200);
    const { fields, colleges } = res.body.data;
    expect(fields[0]).toMatchObject({ slug: 'eng', name: 'كلية الهندسة' });
    expect(colleges.length).toBeGreaterThan(0);
    expect(colleges[0]).toMatchObject({ name: expect.stringContaining('الهندسة') });

    const slug = await mentor({
      name: 'يحيى المنشاوي',
      university: 'cairo',
      kind: 'law',
      price: 200,
    });
    const m = (await request(h.app).get('/api/v1/search/suggest').query({ q: 'يحيى' })).body.data;
    expect(m.mentors.map((x: { slug: string }) => x.slug)).toContain(slug);

    const empty = (await request(h.app).get('/api/v1/search/suggest').query({ q: '' })).body.data;
    expect(empty).toEqual({ fields: [], colleges: [], mentors: [] });
  });

  it('counts a term once per visitor and shows it only after enough visitors', async () => {
    const search = h.searchService;
    const term = 'طب عين شمس';
    expect(await search.record(term, '203.0.113.1')).toBe(true);
    expect(await search.record(term, '203.0.113.1')).toBe(false); // same visitor, same day
    expect(await search.record('كلام ملوش أي نتيجة خالص', '203.0.113.2')).toBe(false);
    expect(await search.popular()).not.toContain(term);

    for (let i = 2; i <= POPULAR_MIN_VISITORS; i++)
      expect(await search.record(term, `203.0.113.${10 + i}`)).toBe(true);
    expect(await search.popular()).toContain(term);

    const res = await request(h.app).post('/api/v1/search/log').send({ q: term }).expect(200);
    expect(res.body.data).toHaveProperty('counted');
    await request(h.app).post('/api/v1/search/log').send({ q: '<script>' }).expect(400);
  });
});
