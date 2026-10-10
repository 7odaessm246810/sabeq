/**
 * Bookings (Phase 15): holding a slot, the race for one slot, paying (fake gateway), cancellation refunds,
 * completion and the sweeper. Shared test database — every mentor and student here is new.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

/** Pays through the fake gateway's checkout — the same signed-callback path as Paymob. */
async function payFor(agent: ReturnType<typeof request.agent>, id: string) {
  const { paymentId } = (
    await agent.post(`/api/v1/bookings/${id}/pay`).send({ method: 'card' }).expect(200)
  ).body.data;
  await agent.post(`/api/v1/payments/fake/checkout/${paymentId}/success`).expect(303);
  return (await agent.get(`/api/v1/bookings/${id}`).expect(200)).body.data.booking;
}

/** Open all day, every day — so there are slots both inside and outside 24 hours. */
const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 0,
  endMinute: 1440,
}));

async function mentor() {
  const s = await h.loginWeb('mentor');
  const faculty = await h.db.faculty.findFirstOrThrow({
    where: { university: { slug: 'cairo' }, kind: { slug: 'med' } },
  });
  const slug = `m-book-${s.userId.slice(-10)}`;
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: 'رامي فتحي' } });
  await h.db.mentor.create({
    data: {
      userId: s.userId,
      slug,
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'طب',
      basePricePiasters: 20_000,
      isListed: true,
      listedAt: new Date(),
      offerings: {
        create: [
          { kind: 'consultation', durationMin: 45, medium: 'video' },
          { kind: 'comparison', durationMin: 60, medium: 'video' },
        ],
      },
    },
  });
  await s.agent.put('/api/v1/me/availability/rules').send({ rules: ALL_DAY }).expect(200);
  return { ...s, slug };
}

async function student(name = 'سلمى حسن') {
  const s = await h.loginWeb('student');
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: name } });
  return s;
}

const slots = async (slug: string) =>
  (
    await request(h.app).get(`/api/v1/mentors/${slug}/availability`).expect(200)
  ).body.data.availability.days.flatMap((d: { slots: string[] }) => d.slots) as string[];

const HOUR = 3_600_000;

describe('booking a slot', () => {
  it('holds the slot while the student pays, with the price snapshot', async () => {
    const m = await mentor();
    const s = await student();
    const at = (await slots(m.slug))[0] ?? '';

    const res = await s.agent
      .post('/api/v1/bookings')
      .send({ mentorSlug: m.slug, kind: 'comparison', startsAt: at, note: 'طب ولا صيدلة؟' })
      .expect(201);
    const b = res.body.data.booking;
    expect(b).toMatchObject({
      status: 'pending',
      kind: 'comparison',
      durationMin: 60,
      priceEgp: 260, // 200 × 1.3
      feeEgp: 15,
      totalEgp: 275,
      note: 'طب ولا صيدلة؟',
      mentor: { slug: m.slug, name: 'رامي فتحي' },
    });
    expect(Date.parse(b.holdExpiresAt) - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(await slots(m.slug)).not.toContain(at);

    // Mentors can't book, and only offered slots can be booked.
    await m.agent
      .post('/api/v1/bookings')
      .send({ mentorSlug: m.slug, kind: 'consultation', startsAt: at })
      .expect(403);
    const odd = new Date(Date.parse(at) + 7 * 60_000).toISOString();
    await s.agent
      .post('/api/v1/bookings')
      .send({ mentorSlug: m.slug, kind: 'consultation', startsAt: odd })
      .expect(409);
  });

  it('sells a slot once when two students race for it', async () => {
    const m = await mentor();
    const [a, b] = await Promise.all([student('أحمد علي'), student('بسمة نور')]);
    const at = (await slots(m.slug))[2] ?? '';
    const body = { mentorSlug: m.slug, kind: 'consultation', startsAt: at };
    const results = await Promise.all([
      a.agent.post('/api/v1/bookings').send(body),
      b.agent.post('/api/v1/bookings').send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.body.error.message).toMatch(/سبقك|مبقاش متاح/);
  });

  it('frees the slot when the hold expires', async () => {
    const m = await mentor();
    const s = await student();
    const other = await student('تانية');
    const at = (await slots(m.slug))[4] ?? '';
    const held = (
      await s.agent
        .post('/api/v1/bookings')
        .send({ mentorSlug: m.slug, kind: 'consultation', startsAt: at })
        .expect(201)
    ).body.data.booking;
    await h.db.booking.update({
      where: { id: held.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(await slots(m.slug)).toContain(at);
    await other.agent
      .post('/api/v1/bookings')
      .send({ mentorSlug: m.slug, kind: 'consultation', startsAt: at })
      .expect(201);
    const pay = await s.agent
      .post(`/api/v1/bookings/${held.id}/pay`)
      .send({ method: 'card' })
      .expect(409);
    expect(pay.body.error.message).toBeTruthy();
  });
});

describe('who can book', () => {
  it('asks for the student name first — the mentor sees it', async () => {
    const m = await mentor();
    const nameless = await h.loginWeb('student');
    const at = (await slots(m.slug))[8] ?? '';
    const res = await nameless.agent
      .post('/api/v1/bookings')
      .send({ mentorSlug: m.slug, kind: 'consultation', startsAt: at })
      .expect(409);
    expect(res.body.error.message).toContain('اسمك');
  });
});

describe('paying, listing and cancelling', () => {
  it('confirms with the test payment and tells the mentor', async () => {
    const m = await mentor();
    const s = await student();
    const at = (await slots(m.slug))[6] ?? '';
    const held = (
      await s.agent
        .post('/api/v1/bookings')
        .send({ mentorSlug: m.slug, kind: 'consultation', startsAt: at })
        .expect(201)
    ).body.data.booking;

    const paid = await payFor(s.agent, held.id);
    expect(paid).toMatchObject({ status: 'confirmed', holdExpiresAt: null });

    const mine = (await s.agent.get('/api/v1/bookings?scope=upcoming').expect(200)).body.data
      .bookings;
    expect(mine.map((x: { id: string }) => x.id)).toContain(held.id);
    const theirs = (await m.agent.get('/api/v1/bookings?scope=upcoming').expect(200)).body.data
      .bookings;
    // The mentor sees the student and their own earning: 200 − 10% = 180.
    expect(theirs[0]).toMatchObject({
      id: held.id,
      student: { name: 'سلمى حسن' },
      earningEgp: 180,
    });
    const note = await h.db.notification.findFirst({
      where: { userId: m.userId, type: 'booking.confirmed' },
    });
    expect(note?.body).toContain('سلمى حسن');

    // Strangers see nothing.
    const stranger = await student('غريب');
    await stranger.agent.get(`/api/v1/bookings/${held.id}`).expect(404);
    await stranger.agent.post(`/api/v1/bookings/${held.id}/cancel`).send({}).expect(404);
  });

  it('refunds in full early, half the price late, and in full when the mentor cancels', async () => {
    const m = await mentor();
    const all = await slots(m.slug);
    const early = all.find((x) => Date.parse(x) - Date.now() > 30 * HOUR) ?? '';
    const late = all.find((x) => Date.parse(x) - Date.now() < 23 * HOUR) ?? '';
    const byMentor = all.find((x) => Date.parse(x) - Date.now() > 40 * HOUR) ?? '';

    const book = async (at: string) => {
      const s = await student();
      const b = (
        await s.agent
          .post('/api/v1/bookings')
          .send({ mentorSlug: m.slug, kind: 'consultation', startsAt: at })
          .expect(201)
      ).body.data.booking;
      await payFor(s.agent, b.id);
      return { s, id: b.id as string };
    };

    const e = await book(early);
    const eRes = (await e.s.agent.post(`/api/v1/bookings/${e.id}/cancel`).send({}).expect(200)).body
      .data.booking;
    // Paid through the fake gateway, so the refund goes through at once.
    expect(eRes).toMatchObject({ status: 'refunded', cancelledBy: 'student', refundEgp: 215 });

    const l = await book(late);
    const lRes = (await l.s.agent.post(`/api/v1/bookings/${l.id}/cancel`).send({}).expect(200)).body
      .data.booking;
    expect(lRes).toMatchObject({ status: 'refunded', refundEgp: 100 }); // half of 200, fee kept

    const x = await book(byMentor);
    const xRes = (
      await m.agent.post(`/api/v1/bookings/${x.id}/cancel`).send({ reason: 'ظرف طارئ' }).expect(200)
    ).body.data.booking;
    expect(xRes).toMatchObject({ cancelledBy: 'mentor', refundEgp: 215, cancelReason: 'ظرف طارئ' });
    const told = await h.db.notification.findFirst({
      where: { userId: x.s.userId, type: 'booking.cancelled' },
    });
    expect(told?.body).toContain('كاملة');

    // Cancelling twice is refused, and the slot is bookable again.
    await e.s.agent.post(`/api/v1/bookings/${e.id}/cancel`).send({}).expect(409);
    expect(await slots(m.slug)).toContain(early);
  });
});

describe('after the session', () => {
  async function pastBooking(minutesAgoStart: number, durationMin = 45) {
    const m = await mentor();
    const s = await student();
    const startsAt = new Date(Date.now() - minutesAgoStart * 60_000);
    const b = await h.db.booking.create({
      data: {
        studentId: s.userId,
        mentorId: m.userId,
        kind: 'consultation',
        durationMin,
        medium: 'video',
        pricePiasters: 20_000,
        feePiasters: 1500,
        totalPiasters: 21_500,
        commissionBps: 1000,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
        status: 'confirmed',
      },
    });
    return { m, s, id: b.id };
  }

  it('lets the mentor mark a finished session done, or the student absent', async () => {
    const live = await pastBooking(10);
    await live.m.agent.post(`/api/v1/bookings/${live.id}/complete`).expect(409); // not over yet
    await live.m.agent.post(`/api/v1/bookings/${live.id}/no-show`).expect(409); // too early

    const done = await pastBooking(60);
    await done.s.agent.post(`/api/v1/bookings/${done.id}/complete`).expect(403);
    const res = await done.m.agent.post(`/api/v1/bookings/${done.id}/complete`).expect(200);
    expect(res.body.data.booking.status).toBe('completed');
    const mentorRow = await h.db.mentor.findUniqueOrThrow({ where: { userId: done.m.userId } });
    expect(mentorRow.sessionsCompleted).toBe(1);
    // The mentor's earning: 200 EGP minus the 10% commission, on the ledger.
    const ledger = await h.db.ledgerEntry.findMany({ where: { bookingId: done.id } });
    expect(ledger).toMatchObject([{ type: 'mentor_earning', amountPiasters: 18_000 }]);
    await done.s.agent.post(`/api/v1/bookings/${done.id}/cancel`).send({}).expect(409);

    const absent = await pastBooking(20);
    const ns = await absent.m.agent.post(`/api/v1/bookings/${absent.id}/no-show`).expect(200);
    expect(ns.body.data.booking.status).toBe('no_show');
    const past = (await absent.s.agent.get('/api/v1/bookings?scope=past')).body.data.bookings;
    expect(past.map((x: { id: string }) => x.id)).toContain(absent.id);
  });

  it('sweeps: expired holds are freed and old sessions complete themselves', async () => {
    const old = await pastBooking(26 * 60);
    const result = await h.bookingsService.sweep();
    expect(result.completed).toBeGreaterThanOrEqual(1);
    const row = await h.db.booking.findUniqueOrThrow({ where: { id: old.id } });
    expect(row.status).toBe('completed');
  });
});
