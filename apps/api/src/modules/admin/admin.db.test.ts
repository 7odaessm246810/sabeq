/**
 * The admin dashboard (Phase 20): who sees what, refunds that settle disputes, review moderation,
 * suspending accounts, and paying mentors — every change audited.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

const DAY = 86_400_000;

async function mentor() {
  const m = await h.loginWeb('mentor');
  const faculty = await h.db.faculty.findFirstOrThrow({ where: { university: { slug: 'cairo' } } });
  await h.db.user.update({ where: { id: m.userId }, data: { fullName: 'كريم سمير' } });
  await h.db.mentor.create({
    data: {
      userId: m.userId,
      slug: `m-adm-${m.userId.slice(-10)}`,
      kind: 'graduate',
      facultyId: faculty.id,
      majorLabel: 'طب',
      basePricePiasters: 20_000,
      isListed: true,
      listedAt: new Date(),
    },
  });
  return m;
}

async function student(name = 'نور علي') {
  const s = await h.loginWeb('student');
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: name } });
  return s;
}

/** A paid session; `completed` ones carry the mentor's earning like a real completion. */
async function paid(mentorId: string, studentId: string, status: 'confirmed' | 'completed') {
  const startsAt = new Date(Date.now() + (status === 'completed' ? -2 : 3) * DAY);
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
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      status,
      ...(status === 'completed'
        ? { completedAt: new Date(startsAt.getTime() + 45 * 60_000) }
        : {}),
      payments: {
        create: {
          method: 'card',
          amountPiasters: 21_500,
          status: 'succeeded',
          providerTxnId: String(Math.floor(Math.random() * 1e9)),
          succeededAt: new Date(),
        },
      },
    },
  });
  if (status === 'completed') {
    await h.db.ledgerEntry.create({
      data: { mentorId, bookingId: b.id, type: 'mentor_earning', amountPiasters: 18_000 },
    });
    await h.db.mentor.update({
      where: { userId: mentorId },
      data: { sessionsCompleted: { increment: 1 } },
    });
  }
  return b.id;
}

const audits = (entityId: string) =>
  h.db.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });

describe('access', () => {
  it('admins only, each to their part', async () => {
    const s = await student();
    await s.agent.get('/api/v1/admin/overview').expect(401); // a website session is not an admin one
    const verifier = await h.loginAdmin('verifier');
    const support = await h.loginAdmin('support');
    const finance = await h.loginAdmin('finance');

    const o = (await verifier.agent.get('/api/v1/admin/overview').expect(200)).body.data;
    expect(o).toMatchObject({
      people: expect.any(Object),
      sessions: expect.any(Object),
      money: expect.any(Object),
    });
    await verifier.agent.get('/api/v1/admin/bookings').expect(403);
    await verifier.agent.get('/api/v1/admin/users').expect(403);
    await finance.agent.get('/api/v1/admin/bookings').expect(200);
    await finance.agent.get('/api/v1/admin/users').expect(403);
    await support.agent.get('/api/v1/admin/payouts/balances').expect(403);
    await finance.agent.get('/api/v1/admin/payouts/balances').expect(200);
  });
});

describe('bookings', () => {
  it('support refunds a dispute in full, even after the session; finance can only look', async () => {
    const m = await mentor();
    const s = await student();
    const support = await h.loginAdmin('support');
    const finance = await h.loginAdmin('finance');

    const upcoming = await paid(m.userId, s.userId, 'confirmed');
    const list = (
      await support.agent
        .get(`/api/v1/admin/bookings?q=${encodeURIComponent('كريم سمير')}`)
        .expect(200)
    ).body.data;
    expect(list.items.map((b: { id: string }) => b.id)).toContain(upcoming);

    await finance.agent
      .post(`/api/v1/admin/bookings/${upcoming}/refund`)
      .send({ reason: 'خلاف' })
      .expect(403);
    await support.agent
      .post(`/api/v1/admin/bookings/${upcoming}/refund`)
      .send({ reason: '' })
      .expect(400);
    const done = (
      await support.agent
        .post(`/api/v1/admin/bookings/${upcoming}/refund`)
        .send({ reason: 'المرشد بلّغ إنه مش هيقدر يحضر' })
        .expect(200)
    ).body.data.booking;
    expect(done).toMatchObject({ status: 'refunded', refundShareBps: 10_000 });
    expect(done.payments[0]).toMatchObject({
      status: 'refunded',
      refunds: [{ amountEgp: 215, status: 'succeeded' }],
    });
    await support.agent
      .post(`/api/v1/admin/bookings/${upcoming}/refund`)
      .send({ reason: 'تاني' })
      .expect(409);
    expect((await audits(upcoming)).map((a) => a.action)).toEqual(['booking.admin_refund']);
    const told = await h.db.notification.count({
      where: { type: 'booking.cancelled', data: { path: ['bookingId'], equals: upcoming } },
    });
    expect(told).toBe(2);

    // After the session: the mentor's earning is reversed.
    const past = await paid(m.userId, s.userId, 'completed');
    await support.agent
      .post(`/api/v1/admin/bookings/${past}/refund`)
      .send({ reason: 'الجلسة ما اتعملتش فعلًا' })
      .expect(200);
    const detail = (await finance.agent.get(`/api/v1/admin/bookings/${past}`).expect(200)).body.data
      .booking;
    expect(
      detail.ledger.map((l: { type: string; amountEgp: number }) => [l.type, l.amountEgp]),
    ).toEqual([
      ['mentor_earning', 180],
      ['refund_reversal', -180],
    ]);
    const row = await h.db.mentor.findUniqueOrThrow({ where: { userId: m.userId } });
    expect(row.sessionsCompleted).toBe(0);
  });
});

describe('reviews and accounts', () => {
  it('hiding a review takes it out of the rating; restoring puts it back', async () => {
    const m = await mentor();
    const support = await h.loginAdmin('support');
    const ids: string[] = [];
    for (const rating of [5, 1]) {
      const s = await student();
      const b = await paid(m.userId, s.userId, 'completed');
      await s.agent.post(`/api/v1/bookings/${b}/review`).send({ rating }).expect(201);
      ids.push((await h.db.review.findUniqueOrThrow({ where: { bookingId: b } })).id);
    }
    const [, low] = ids as [string, string];
    expect(
      Number((await h.db.mentor.findUniqueOrThrow({ where: { userId: m.userId } })).ratingAvg),
    ).toBe(3);

    await support.agent
      .post(`/api/v1/admin/reviews/${low}/status`)
      .send({ status: 'hidden', note: 'شتيمة' })
      .expect(200);
    let row = await h.db.mentor.findUniqueOrThrow({ where: { userId: m.userId } });
    expect([Number(row.ratingAvg), row.ratingCount]).toEqual([5, 1]);
    const hidden = (await support.agent.get('/api/v1/admin/reviews?status=hidden').expect(200)).body
      .data;
    expect(hidden.items.map((r: { id: string }) => r.id)).toContain(low);

    await support.agent
      .post(`/api/v1/admin/reviews/${low}/status`)
      .send({ status: 'published', note: 'اتراجع' })
      .expect(200);
    row = await h.db.mentor.findUniqueOrThrow({ where: { userId: m.userId } });
    expect([Number(row.ratingAvg), row.ratingCount]).toEqual([3, 2]);
    expect((await audits(low)).map((a) => a.action)).toEqual(['review.hide', 'review.restore']);
  });

  it('a suspended account is signed out at once and can come back', async () => {
    const s = await student('سلمى فريد');
    const support = await h.loginAdmin('support');
    const admin = await h.loginAdmin('finance');
    await s.agent.get('/api/v1/me/profile').expect(200);

    const found = (await support.agent.get(`/api/v1/admin/users?q=${s.phone}`).expect(200)).body
      .data;
    expect(found.items).toMatchObject([{ id: s.userId, name: 'سلمى فريد', status: 'active' }]);

    await support.agent
      .post(`/api/v1/admin/users/${s.userId}/status`)
      .send({ status: 'suspended', note: 'سبام' })
      .expect(200);
    await s.agent.get('/api/v1/me/profile').expect(401);
    await support.agent
      .post(`/api/v1/admin/users/${s.userId}/status`)
      .send({ status: 'suspended', note: 'تاني' })
      .expect(409);
    await support.agent
      .post(`/api/v1/admin/users/${admin.userId}/status`)
      .send({ status: 'suspended', note: 'محاولة' })
      .expect(403);

    await support.agent
      .post(`/api/v1/admin/users/${s.userId}/status`)
      .send({ status: 'active', note: 'اتحلت' })
      .expect(200);
    expect((await audits(s.userId)).map((a) => a.action)).toEqual([
      'user.suspend',
      'user.reactivate',
    ]);
  });
});

describe('paying mentors', () => {
  it('the mentor adds how to get paid; finance sees the balance, opens the details, records the transfer', async () => {
    const m = await mentor();
    const s = await student();
    const finance = await h.loginAdmin('finance');
    await paid(m.userId, s.userId, 'completed');
    await paid(m.userId, s.userId, 'completed');

    await m.agent
      .put('/api/v1/me/mentor/payout-account')
      .send({ method: 'vodafone_cash', phone: '123' })
      .expect(400);
    await m.agent
      .put('/api/v1/me/mentor/payout-account')
      .send({
        method: 'bank_transfer',
        bankName: 'CIB',
        accountHolder: 'كريم سمير',
        accountNumber: 'EG12',
      })
      .expect(400);
    const acc = (
      await m.agent
        .put('/api/v1/me/mentor/payout-account')
        .send({ method: 'vodafone_cash', phone: '01012345678' })
        .expect(200)
    ).body.data.account;
    expect(acc).toMatchObject({ method: 'vodafone_cash', display: 'فودافون كاش · •••• 5678' });
    await s.agent.get('/api/v1/me/mentor/payout-account').expect(403);
    const sealed = await h.db.payoutAccount.findUniqueOrThrow({ where: { mentorId: m.userId } });
    expect(sealed.detailsEnc).not.toContain('1012345678');

    expect((await m.agent.get('/api/v1/me/mentor/earnings').expect(200)).body.data).toMatchObject({
      balanceEgp: 360,
      earnedEgp: 360,
      paidEgp: 0,
    });
    const balances = (await finance.agent.get('/api/v1/admin/payouts/balances').expect(200)).body
      .data.mentors;
    expect(balances.find((b: { mentorId: string }) => b.mentorId === m.userId)).toMatchObject({
      balanceEgp: 360,
      account: { method: 'vodafone_cash', display: 'فودافون كاش · •••• 5678' },
    });

    const details = (
      await finance.agent.get(`/api/v1/admin/payouts/accounts/${m.userId}`).expect(200)
    ).body.data.details;
    expect(details).toEqual({ method: 'vodafone_cash', phone: '+201012345678' });

    const pay = (amountEgp: number, reference = 'VF-778899') =>
      finance.agent
        .post('/api/v1/admin/payouts')
        .send({ mentorId: m.userId, amountEgp, reference });
    await pay(400).expect(409);
    const first = (await pay(300).expect(201)).body.data.payout;
    expect(first).toMatchObject({ amountEgp: 300, balanceEgp: 60 });
    await pay(61).expect(409);
    await pay(60).expect(201);
    await pay(1).expect(409);

    expect((await m.agent.get('/api/v1/me/mentor/earnings').expect(200)).body.data).toMatchObject({
      balanceEgp: 0,
      earnedEgp: 360,
      paidEgp: 360,
    });
    expect(
      await h.db.notification.count({ where: { userId: m.userId, type: 'payout.paid' } }),
    ).toBe(2);
    expect((await audits(m.userId)).map((a) => a.action)).toEqual([
      'payout_account.view',
      'payout.record',
      'payout.record',
    ]);
    const history = (await finance.agent.get('/api/v1/admin/payouts').expect(200)).body.data.items;
    expect(
      history.filter((p: { slug: string }) => p.slug.startsWith('m-adm-')).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
