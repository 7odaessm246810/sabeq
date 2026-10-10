/**
 * Reviews (Phase 18): only after a completed session, by its student, once; the mentor's rating
 * is the real average. Shared test database — every mentor and student here is new.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

const DAY = 86_400_000;

async function mentor() {
  const m = await h.loginWeb('mentor');
  const faculty = await h.db.faculty.findFirstOrThrow({
    where: { university: { slug: 'cairo' }, kind: { slug: 'med' } },
  });
  const slug = `m-rev-${m.userId.slice(-10)}`;
  await h.db.user.update({ where: { id: m.userId }, data: { fullName: 'سارة منير' } });
  await h.db.mentor.create({
    data: {
      userId: m.userId,
      slug,
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'طب',
      basePricePiasters: 20_000,
      isListed: true,
      listedAt: new Date(),
    },
  });
  return { ...m, slug };
}

async function student(name = 'عمر طارق') {
  const s = await h.loginWeb('student');
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: name } });
  return s;
}

/** A session with this mentor that ended `daysAgo` days ago, in `status`. */
async function session(
  mentorId: string,
  studentId: string,
  status: 'completed' | 'confirmed' | 'no_show' = 'completed',
  daysAgo = 1,
) {
  const startsAt = new Date(Date.now() - daysAgo * DAY - 45 * 60_000);
  const endsAt = new Date(Date.now() - daysAgo * DAY);
  const b = await h.db.booking.create({
    data: {
      studentId,
      mentorId,
      kind: 'consultation',
      durationMin: 45,
      medium: 'video',
      pricePiasters: 20_000,
      feePiasters: 1500,
      totalPiasters: 21_500,
      commissionBps: 1000,
      startsAt,
      endsAt,
      status,
      ...(status === 'completed' ? { completedAt: endsAt } : {}),
    },
  });
  return b.id;
}

const review = (agent: Awaited<ReturnType<typeof student>>['agent'], id: string, body: object) =>
  agent.post(`/api/v1/bookings/${id}/review`).send(body);

describe('rating a session', () => {
  it('after a completed session, by its student, once — and the profile shows it', async () => {
    const m = await mentor();
    const s = await student('عمر طارق');
    const id = await session(m.userId, s.userId);

    const created = await review(s.agent, id, { rating: 5, text: '  فهمت الفرق بين الأقسام  ' });
    expect(created.status).toBe(201);
    expect(created.body.data.review).toMatchObject({ rating: 5, text: 'فهمت الفرق بين الأقسام' });

    const again = await review(s.agent, id, { rating: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toContain('قبل كده');

    const booking = (await s.agent.get(`/api/v1/bookings/${id}`).expect(200)).body.data.booking;
    expect(booking.review).toEqual({ rating: 5, text: 'فهمت الفرق بين الأقسام' });

    const profile = (await request(h.app).get(`/api/v1/mentors/${m.slug}`).expect(200)).body.data;
    const p = profile.mentor ?? profile;
    expect(p.rating).toBe(5);
    expect(p.ratingCount).toBe(1);
    expect(p.reviews[0]).toMatchObject({
      rating: 5,
      name: 'عمر',
      topic: 'جلسة استشارة',
      text: 'فهمت الفرق بين الأقسام',
    });

    const note = await h.db.notification.findFirst({
      where: { userId: m.userId, type: 'review.created' },
    });
    expect(note?.body).toContain('5 من 5');
  });

  it('refuses anyone else, unfinished or absent sessions, bad ratings and late ones', async () => {
    const m = await mentor();
    const s = await student();
    const other = await student();

    const done = await session(m.userId, s.userId);
    expect((await review(other.agent, done, { rating: 4 })).status).toBe(404);
    expect((await review(m.agent, done, { rating: 4 })).status).toBe(403);
    expect((await review(s.agent, done, { rating: 0 })).status).toBe(400);
    expect((await review(s.agent, done, { rating: 6 })).status).toBe(400);
    expect((await review(s.agent, done, { rating: 4.5 })).status).toBe(400);
    expect((await review(s.agent, done, { rating: 4, text: 'x'.repeat(1001) })).status).toBe(400);
    expect((await review(s.agent, done, { rating: 4, extra: 1 })).status).toBe(400);

    const upcoming = await session(m.userId, s.userId, 'confirmed', -2);
    expect((await review(s.agent, upcoming, { rating: 4 })).status).toBe(409);
    const absent = await session(m.userId, s.userId, 'no_show', 3);
    expect((await review(s.agent, absent, { rating: 4 })).status).toBe(409);
    const old = await session(m.userId, s.userId, 'completed', 31);
    const late = await review(s.agent, old, { rating: 4 });
    expect(late.status).toBe(409);
    expect(late.body.error.message).toContain('30');

    expect(await h.db.review.count({ where: { mentorId: m.userId } })).toBe(0);
  });

  it('the rating is the average of published reviews; hidden ones drop out', async () => {
    const m = await mentor();
    const ratings = [5, 4, 2];
    for (const r of ratings) {
      const s = await student();
      const id = await session(m.userId, s.userId);
      await review(s.agent, id, { rating: r }).expect(201);
    }
    let row = await h.db.mentor.findUniqueOrThrow({ where: { userId: m.userId } });
    expect(Number(row.ratingAvg)).toBe(3.67);
    expect(row.ratingCount).toBe(3);

    // Moderation (admin, Phase 20) hides a review: the average follows.
    const { recomputeRating } = await import('./reviews.service.js');
    await h.db.review.updateMany({
      where: { mentorId: m.userId, rating: 2 },
      data: { status: 'hidden' },
    });
    await h.db.$transaction((tx) => recomputeRating(tx, m.userId));
    row = await h.db.mentor.findUniqueOrThrow({ where: { userId: m.userId } });
    expect(Number(row.ratingAvg)).toBe(4.5);
    expect(row.ratingCount).toBe(2);

    const page = (await request(h.app).get(`/api/v1/mentors/${m.slug}/reviews`).expect(200)).body
      .data;
    expect(page).toMatchObject({ rating: 4.5, ratingCount: 2, hasMore: false });
    expect(page.reviews.map((r: { rating: number }) => r.rating)).toEqual([4, 5]);
    await request(h.app).get('/api/v1/mentors/nobody-here/reviews').expect(404);
  });
});
