/**
 * Sessions (Phase 17) with the test room: when the room opens, who may join, attendance, and the
 * full refund when the mentor never comes. Shared test database — every mentor and student is new.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

const MIN = 60_000;

async function pair() {
  const m = await h.loginWeb('mentor');
  const faculty = await h.db.faculty.findFirstOrThrow({
    where: { university: { slug: 'cairo' }, kind: { slug: 'med' } },
  });
  await h.db.user.update({ where: { id: m.userId }, data: { fullName: 'نادر سامي' } });
  await h.db.mentor.create({
    data: {
      userId: m.userId,
      slug: `m-room-${m.userId.slice(-10)}`,
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'طب',
      basePricePiasters: 20_000,
      isListed: true,
      listedAt: new Date(),
    },
  });
  const s = await h.loginWeb('student');
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: 'منة خالد' } });
  return { m, s };
}

/** A paid, confirmed session starting `minutesFromNow` (negative: already started). */
async function session(minutesFromNow: number, status: 'confirmed' | 'pending' = 'confirmed') {
  const { m, s } = await pair();
  const startsAt = new Date(Date.now() + minutesFromNow * MIN);
  const b = await h.db.booking.create({
    data: {
      studentId: s.userId,
      mentorId: m.userId,
      kind: 'consultation',
      durationMin: 45,
      medium: 'video',
      pricePiasters: 20_000,
      feePiasters: 1500,
      totalPiasters: 21_500,
      commissionBps: 1000,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * MIN),
      status,
      ...(status === 'pending' ? { holdExpiresAt: new Date(Date.now() + 10 * MIN) } : {}),
      ...(status === 'confirmed'
        ? {
            payments: {
              create: {
                method: 'card',
                amountPiasters: 21_500,
                status: 'succeeded',
                providerTxnId: String(Math.floor(Math.random() * 1e9)),
                succeededAt: new Date(),
              },
            },
          }
        : {}),
    },
  });
  return { m, s, id: b.id };
}

const view = async (agent: Awaited<ReturnType<typeof pair>>['s']['agent'], id: string) =>
  (await agent.get(`/api/v1/bookings/${id}`).expect(200)).body.data.booking;

describe('joining the session room', () => {
  it('opens 10 minutes before the start, for the two of them only', async () => {
    const later = await session(30);
    const early = await later.s.agent.post(`/api/v1/bookings/${later.id}/join`).expect(409);
    expect(early.body.error.message).toContain('10');

    const soon = await session(5);
    const other = await h.loginWeb('student');
    await other.agent.post(`/api/v1/bookings/${soon.id}/join`).expect(404);

    const joined = (await soon.s.agent.post(`/api/v1/bookings/${soon.id}/join`).expect(200)).body
      .data;
    expect(joined).toMatchObject({ provider: 'fake', url: null });
    expect(Date.parse(joined.closesAt)).toBe(
      Date.parse((await view(soon.s.agent, soon.id)).endsAt) + 15 * MIN,
    );

    let b = await view(soon.s.agent, soon.id);
    expect(b.session).toMatchObject({ studentJoined: true, mentorJoined: false });
    await soon.m.agent.post(`/api/v1/bookings/${soon.id}/join`).expect(200);
    await soon.s.agent.post(`/api/v1/bookings/${soon.id}/join`).expect(200); // again: fine
    b = await view(soon.m.agent, soon.id);
    expect(b.session).toMatchObject({ studentJoined: true, mentorJoined: true });
    const meeting = await h.db.meeting.findUniqueOrThrow({ where: { bookingId: soon.id } });
    expect(meeting).toMatchObject({ provider: 'fake', roomId: `fake-${soon.id}` });
  });

  it('only for confirmed sessions that are not over', async () => {
    const unpaid = await session(5, 'pending');
    await unpaid.s.agent.post(`/api/v1/bookings/${unpaid.id}/join`).expect(409);

    const over = await session(-61); // 45 minutes + 15 after the end have passed
    const res = await over.s.agent.post(`/api/v1/bookings/${over.id}/join`).expect(409);
    expect(res.body.error.message).toContain('خلصت');
  });
});

describe('a mentor who never comes', () => {
  it('after 15 minutes: cancelled, and the student gets everything back', async () => {
    const missed = await session(-20);
    await missed.s.agent.post(`/api/v1/bookings/${missed.id}/join`).expect(200);
    const kept = await session(-20);
    await kept.m.agent.post(`/api/v1/bookings/${kept.id}/join`).expect(200);
    const notYet = await session(-5);

    const result = await h.sessionsService.sweep();
    expect(result.mentorNoShows).toBeGreaterThanOrEqual(1);

    const b = await view(missed.s.agent, missed.id);
    expect(b).toMatchObject({
      status: 'refunded',
      cancelledBy: 'mentor',
      refundEgp: 215,
      payment: { status: 'refunded' },
    });
    const refund = await h.db.refund.findFirstOrThrow({
      where: { payment: { bookingId: missed.id } },
    });
    expect(refund).toMatchObject({ status: 'succeeded', amountPiasters: 21_500 });
    const told = await h.db.notification.findMany({
      where: { type: 'booking.mentor_absent', data: { path: ['bookingId'], equals: missed.id } },
    });
    expect(told.map((n) => n.userId).sort()).toEqual([missed.m.userId, missed.s.userId].sort());
    expect(await h.db.ledgerEntry.count({ where: { bookingId: missed.id } })).toBe(0);

    expect((await view(kept.s.agent, kept.id)).status).toBe('confirmed');
    expect((await view(notYet.s.agent, notYet.id)).status).toBe('confirmed');

    // Running it again changes nothing.
    await h.sessionsService.sweep();
    expect(await h.db.refund.count({ where: { payment: { bookingId: missed.id } } })).toBe(1);
  });
});
