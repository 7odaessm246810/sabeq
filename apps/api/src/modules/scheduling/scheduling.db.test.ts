/**
 * Availability & scheduling (Phase 14): the mentor's hours, the slots students see, and that busy
 * time is never offered. Shared test database — every mentor here is new.
 */
import { addDays, cairoDate, cairoMinuteOfDay } from '@sabeq/utils';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 23 * 60,
}));

async function makeMentor(accepts = true) {
  const s = await h.loginWeb('mentor');
  const faculty = await h.db.faculty.findFirstOrThrow({
    where: { university: { slug: 'cairo' }, kind: { slug: 'com' } },
  });
  const slug = `m-sched-${s.userId.slice(-10)}`;
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: 'منى الجوهري' } });
  await h.db.mentor.create({
    data: {
      userId: s.userId,
      slug,
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'محاسبة',
      basePricePiasters: 20_000,
      isListed: true,
      listedAt: new Date(),
      acceptsBookings: accepts,
      offerings: {
        create: [
          { kind: 'consultation', durationMin: 45, medium: 'video' },
          { kind: 'comparison', durationMin: 60, medium: 'video' },
        ],
      },
    },
  });
  return { ...s, slug };
}

interface Availability {
  next: string | null;
  durationMin: number;
  days: { date: string; slots: string[] }[];
}
const availability = async (slug: string, kind = 'consultation') =>
  (await request(h.app).get(`/api/v1/mentors/${slug}/availability`).query({ kind }).expect(200))
    .body.data.availability as Availability;

describe("the mentor's hours", () => {
  it('is for mentors with a profile only', async () => {
    await request(h.app).get('/api/v1/me/availability').expect(401);
    const student = await h.loginWeb('student');
    await student.agent.get('/api/v1/me/availability').expect(403);
    const applicant = await h.loginWeb('mentor');
    await applicant.agent.get('/api/v1/me/availability').expect(404);
  });

  it('sets weekly hours, refusing overlaps and odd times', async () => {
    const m = await makeMentor();
    const overlap = await m.agent
      .put('/api/v1/me/availability/rules')
      .send({
        rules: [
          { weekday: 1, startMinute: 18 * 60, endMinute: 20 * 60 },
          { weekday: 1, startMinute: 19 * 60, endMinute: 21 * 60 },
        ],
      })
      .expect(400);
    expect(overlap.body.error.message).toContain('متداخلين');
    await m.agent
      .put('/api/v1/me/availability/rules')
      .send({ rules: [{ weekday: 1, startMinute: 18 * 60 + 10, endMinute: 20 * 60 }] })
      .expect(400);

    const res = await m.agent
      .put('/api/v1/me/availability/rules')
      .send({ rules: ALL_WEEK })
      .expect(200);
    expect(res.body.data.availability.rules).toHaveLength(7);
    expect(res.body.data.availability.upcoming.length).toBeGreaterThan(0);
    expect(res.body.data.availability.timezone).toBe('Africa/Cairo');

    // The page saves what it read: the hours come back in exactly the shape the API accepts.
    const read = (await m.agent.get('/api/v1/me/availability').expect(200)).body.data.availability;
    expect(Object.keys(read.rules[0]).sort()).toEqual(['endMinute', 'startMinute', 'weekday']);
    await m.agent.put('/api/v1/me/availability/rules').send({ rules: read.rules }).expect(200);
  });

  it('can never store overlapping hours, even bypassing the API', async () => {
    const m = await makeMentor();
    await h.db.availabilityRule.create({
      data: { mentorId: m.userId, weekday: 3, startMinute: 600, endMinute: 720 },
    });
    await expect(
      h.db.availabilityRule.create({
        data: { mentorId: m.userId, weekday: 3, startMinute: 690, endMinute: 780 },
      }),
    ).rejects.toThrow();
  });
});

describe('slots students see', () => {
  it('lists three weeks of slots that fit the session, in Cairo time', async () => {
    const m = await makeMentor();
    await m.agent.put('/api/v1/me/availability/rules').send({ rules: ALL_WEEK }).expect(200);

    const a = await availability(m.slug);
    expect(a.days).toHaveLength(21);
    expect(a.durationMin).toBe(45);
    const slots = a.days.flatMap((d) => d.slots);
    expect(slots.length).toBeGreaterThan(100);
    // 12 hours' notice, half-hour starts, inside 09:00–23:00 Cairo with room for the session.
    expect(Date.parse(slots[0] ?? '')).toBeGreaterThanOrEqual(Date.now() + 12 * 3_600_000 - 1000);
    for (const s of slots.slice(0, 40)) {
      const minute = cairoMinuteOfDay(new Date(s));
      expect(minute % 30).toBe(0);
      expect(minute).toBeGreaterThanOrEqual(9 * 60);
      expect(minute + 45).toBeLessThanOrEqual(23 * 60);
    }
    // A 60-minute comparison must also end by 23:00: its last start is 22:00.
    const long = await availability(m.slug, 'comparison');
    expect(long.durationMin).toBe(60);
    for (const d of long.days) {
      const last = d.slots.at(-1);
      if (last) expect(cairoMinuteOfDay(new Date(last)) + 60).toBeLessThanOrEqual(23 * 60);
    }

    await request(h.app)
      .get(`/api/v1/mentors/${m.slug}/availability`)
      .query({ kind: 'quick_call' })
      .expect(400);
    await request(h.app).get('/api/v1/mentors/m-nobody/availability').expect(404);
  });

  it('applies blocked and extra days', async () => {
    const m = await makeMentor();
    await m.agent
      .put('/api/v1/me/availability/rules')
      .send({ rules: [{ weekday: 0, startMinute: 18 * 60, endMinute: 21 * 60 }] })
      .expect(200);
    const target = addDays(cairoDate(new Date()), 5);
    const before = (await availability(m.slug)).days.find((d) => d.date === target);
    const extra = await m.agent
      .post('/api/v1/me/availability/exceptions')
      .send({ date: target, kind: 'extra', startMinute: 10 * 60, endMinute: 12 * 60 })
      .expect(201);
    const after = (await availability(m.slug)).days.find((d) => d.date === target);
    expect(after?.slots.length).toBe((before?.slots.length ?? 0) + 3); // 10:00, 10:30, 11:00

    await m.agent
      .post('/api/v1/me/availability/exceptions')
      .send({ date: target, kind: 'blocked' })
      .expect(201);
    expect((await availability(m.slug)).days.find((d) => d.date === target)?.slots).toEqual([]);

    const id = extra.body.data.availability.exceptions[0].id as string;
    await m.agent.delete(`/api/v1/me/availability/exceptions/${id}`).expect(200);
    await m.agent
      .post('/api/v1/me/availability/exceptions')
      .send({ date: addDays(cairoDate(new Date()), -1), kind: 'blocked' })
      .expect(400);
  });

  it('never offers booked time, and shows nothing when bookings are off', async () => {
    const m = await makeMentor();
    await m.agent.put('/api/v1/me/availability/rules').send({ rules: ALL_WEEK }).expect(200);
    const first = (await availability(m.slug)).next;
    expect(first).not.toBeNull();

    const student = await h.loginWeb('student');
    const startsAt = new Date(first ?? '');
    await h.db.booking.create({
      data: {
        studentId: student.userId,
        mentorId: m.userId,
        kind: 'consultation',
        durationMin: 45,
        medium: 'video',
        pricePiasters: 20_000,
        feePiasters: 0,
        totalPiasters: 20_000,
        commissionBps: 1000,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60_000),
        status: 'confirmed',
      },
    });
    const after = (await availability(m.slug)).days.flatMap((d) => d.slots);
    expect(after).not.toContain(first);
    // The overlapping half-hour start after it is gone too.
    expect(after).not.toContain(new Date(startsAt.getTime() + 30 * 60_000).toISOString());

    const card = (await request(h.app).get(`/api/v1/mentors/${m.slug}`)).body.data.mentor;
    expect(card.nextSlot).not.toBe(first);
    expect(card.nextSlot).not.toBeNull();

    const closed = await makeMentor(false);
    await closed.agent.put('/api/v1/me/availability/rules').send({ rules: ALL_WEEK }).expect(200);
    const none = await availability(closed.slug);
    expect(none.next).toBeNull();
    expect(none.days).toEqual([]);
    const list = await request(h.app)
      .get('/api/v1/mentors')
      .query({ field: 'com', available: '1', pageSize: '24' });
    const slugs = list.body.data.results.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain(m.slug);
    expect(slugs).not.toContain(closed.slug);
  });
});
