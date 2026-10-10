/**
 * Payments (Phase 16) through the fake gateway: only a signed callback for the right amount confirms
 * a booking; callbacks are recorded once; cancellations and late payments are refunded.
 * Shared test database — every mentor and student here is new.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';
import { paymobHmac, type PaymobTransaction } from './hmac.js';

const h = createHarness();
afterAll(() => h.close());

const FAKE_HMAC_SECRET = 'sabeq-fake-gateway-hmac';
const HOUR = 3_600_000;
type Agent = ReturnType<typeof request.agent>;

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
  const slug = `m-pay-${s.userId.slice(-10)}`;
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: 'هالة سمير' } });
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
      offerings: { create: [{ kind: 'consultation', durationMin: 45, medium: 'video' }] },
    },
  });
  await s.agent.put('/api/v1/me/availability/rules').send({ rules: ALL_DAY }).expect(200);
  return { ...s, slug };
}

async function student() {
  const s = await h.loginWeb('student');
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: 'كريم عادل' } });
  return s;
}

const slots = async (slug: string) =>
  (
    await request(h.app).get(`/api/v1/mentors/${slug}/availability`).expect(200)
  ).body.data.availability.days.flatMap((d: { slots: string[] }) => d.slots) as string[];

async function hold(agent: Agent, slug: string, startsAt: string) {
  return (
    await agent
      .post('/api/v1/bookings')
      .send({ mentorSlug: slug, kind: 'consultation', startsAt })
      .expect(201)
  ).body.data.booking as { id: string; totalEgp: number };
}

async function startPay(agent: Agent, id: string, method = 'card') {
  return (await agent.post(`/api/v1/bookings/${id}/pay`).send({ method }).expect(200)).body
    .data as { redirectUrl: string; paymentId: string };
}

const getBooking = async (agent: Agent, id: string) =>
  (await agent.get(`/api/v1/bookings/${id}`).expect(200)).body.data.booking;

/** A Paymob-shaped transaction callback for one of our payments. */
function txn(paymentId: string, amountCents: number, over: Partial<PaymobTransaction> = {}) {
  return {
    id: 900_000_000 + Math.floor(Math.random() * 99_999_999),
    amount_cents: amountCents,
    created_at: new Date().toISOString(),
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 1,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    owner: 1,
    pending: false,
    success: true,
    order: { id: 1, merchant_order_id: paymentId },
    source_data: { pan: '4242', sub_type: 'Visa', type: 'card' },
    data: null,
    ...over,
  } as PaymobTransaction;
}

const webhook = (obj: PaymobTransaction, hmac = paymobHmac(obj as never, FAKE_HMAC_SECRET)) =>
  request(h.app)
    .post(`/api/v1/payments/paymob/webhook?hmac=${hmac}`)
    .send({ type: 'TRANSACTION', obj })
    .expect(200);

describe('paying for a held booking', () => {
  it('sends the student to checkout, and only the signed callback confirms', async () => {
    const m = await mentor();
    const s = await student();
    const b = await hold(s.agent, m.slug, (await slots(m.slug))[0] ?? '');
    expect(b.totalEgp).toBe(215);

    const methods = (await request(h.app).get('/api/v1/payments/methods').expect(200)).body.data;
    expect(methods).toMatchObject({ mode: 'fake', methods: ['card', 'wallet', 'kiosk'] });

    const { redirectUrl, paymentId } = await startPay(s.agent, b.id);
    expect(redirectUrl).toContain(`/api/v1/payments/fake/checkout/${paymentId}`);
    const page = await request(h.app)
      .get(`/api/v1/payments/fake/checkout/${paymentId}`)
      .expect(200);
    expect(page.text).toContain('215 ج.م');
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    // Otherwise the browser posts the test form with `Origin: null` and CORS refuses it.
    expect(page.headers['referrer-policy']).toBe('same-origin');

    // Coming back from checkout is not proof of payment.
    expect((await getBooking(s.agent, b.id)).status).toBe('pending');

    const done = await request(h.app)
      .post(`/api/v1/payments/fake/checkout/${paymentId}/success`)
      .expect(303);
    expect(done.headers.location).toContain(`/book/${m.slug}/done?booking=${b.id}`);
    const booking = await getBooking(s.agent, b.id);
    expect(booking).toMatchObject({
      status: 'confirmed',
      holdExpiresAt: null,
      payment: { status: 'succeeded', method: 'card' },
    });
    const note = await h.db.notification.findFirst({
      where: { userId: m.userId, type: 'booking.confirmed' },
    });
    expect(note).toBeTruthy();
  });

  it('only the student who holds it can pay, and only while it is held', async () => {
    const m = await mentor();
    const s = await student();
    const other = await student();
    const b = await hold(s.agent, m.slug, (await slots(m.slug))[0] ?? '');
    await other.agent.post(`/api/v1/bookings/${b.id}/pay`).send({ method: 'card' }).expect(404);
    await m.agent.post(`/api/v1/bookings/${b.id}/pay`).send({ method: 'card' }).expect(403);
    await s.agent.post(`/api/v1/bookings/${b.id}/pay`).send({ method: 'cash' }).expect(400);
  });

  it('ignores a callback with a bad signature or the wrong amount', async () => {
    const m = await mentor();
    const s = await student();
    const b = await hold(s.agent, m.slug, (await slots(m.slug))[0] ?? '');
    const { paymentId } = await startPay(s.agent, b.id);

    await webhook(txn(paymentId, 21_500), 'a'.repeat(128));
    await webhook(txn(paymentId, 21_500), 'not-even-hex');
    await webhook(txn(paymentId, 100)); // signed, but 1 EGP for a 215 EGP booking
    expect(await getBooking(s.agent, b.id)).toMatchObject({
      status: 'pending',
      payment: { status: 'pending' },
    });
    const events = await h.db.paymentEvent.findMany({ where: { paymentId } });
    expect(events).toHaveLength(3);
    expect(events.filter((e) => e.hmacValid)).toHaveLength(1);
    expect(events.map((e) => e.processingError).sort()).toEqual([
      'amount mismatch',
      'bad hmac',
      'bad hmac',
    ]);
  });

  it('records a repeated callback once', async () => {
    const m = await mentor();
    const s = await student();
    const b = await hold(s.agent, m.slug, (await slots(m.slug))[0] ?? '');
    const { paymentId } = await startPay(s.agent, b.id);
    const obj = txn(paymentId, 21_500);
    await webhook(obj);
    await webhook(obj);
    expect((await getBooking(s.agent, b.id)).status).toBe('confirmed');
    expect(await h.db.paymentEvent.count({ where: { paymentId } })).toBe(1);
    expect(
      await h.db.notification.count({ where: { userId: m.userId, type: 'booking.confirmed' } }),
    ).toBe(1);
  });

  it('a declined card fails the payment and keeps the hold for another try', async () => {
    const m = await mentor();
    const s = await student();
    const b = await hold(s.agent, m.slug, (await slots(m.slug))[0] ?? '');
    const first = await startPay(s.agent, b.id);
    await request(h.app).post(`/api/v1/payments/fake/checkout/${first.paymentId}/fail`).expect(303);
    expect(await getBooking(s.agent, b.id)).toMatchObject({
      status: 'pending',
      payment: { status: 'failed' },
    });

    const again = await startPay(s.agent, b.id, 'wallet');
    expect(again.paymentId).not.toBe(first.paymentId);
    await request(h.app)
      .post(`/api/v1/payments/fake/checkout/${again.paymentId}/success`)
      .expect(303);
    expect(await getBooking(s.agent, b.id)).toMatchObject({
      status: 'confirmed',
      payment: { status: 'succeeded', method: 'wallet' },
    });
  });
});

describe('kiosk payments', () => {
  it('only for sessions two days away; the slot is held a day for the code', async () => {
    const m = await mentor();
    const all = await slots(m.slug);
    const soon = all.find((x) => Date.parse(x) - Date.now() < 40 * HOUR) ?? '';
    const far = all.find((x) => Date.parse(x) - Date.now() > 60 * HOUR) ?? '';

    const s1 = await student();
    const near = await hold(s1.agent, m.slug, soon);
    const refused = await s1.agent
      .post(`/api/v1/bookings/${near.id}/pay`)
      .send({ method: 'kiosk' })
      .expect(409);
    expect(refused.body.error.message).toContain('يومين');

    const s2 = await student();
    const b = await hold(s2.agent, m.slug, far);
    const { paymentId } = await startPay(s2.agent, b.id, 'kiosk');
    const row = await h.db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect((row.holdExpiresAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(23 * HOUR);

    await request(h.app).post(`/api/v1/payments/fake/checkout/${paymentId}/kiosk`).expect(303);
    const pending = await getBooking(s2.agent, b.id);
    expect(pending).toMatchObject({ status: 'pending', payment: { status: 'pending' } });
    expect(pending.payment.kioskReference).toMatch(/^\d+$/);

    await request(h.app).post(`/api/v1/payments/fake/checkout/${paymentId}/success`).expect(303);
    expect((await getBooking(s2.agent, b.id)).status).toBe('confirmed');
  });
});

describe('refunds', () => {
  async function paid(slug: string, at: string) {
    const s = await student();
    const b = await hold(s.agent, slug, at);
    const { paymentId } = await startPay(s.agent, b.id);
    await request(h.app).post(`/api/v1/payments/fake/checkout/${paymentId}/success`).expect(303);
    return { s, id: b.id, paymentId };
  }

  it('cancelling a paid booking refunds the money back to the student', async () => {
    const m = await mentor();
    const all = await slots(m.slug);
    const early = all.find((x) => Date.parse(x) - Date.now() > 30 * HOUR) ?? '';
    const late = all.find((x) => Date.parse(x) - Date.now() < 23 * HOUR) ?? '';

    // 24 hours or more ahead: everything back, the 15 EGP fee included.
    const e = await paid(m.slug, early);
    await e.s.agent.post(`/api/v1/bookings/${e.id}/cancel`).send({}).expect(200);
    expect(await getBooking(e.s.agent, e.id)).toMatchObject({
      status: 'refunded',
      payment: { status: 'refunded' },
    });
    const er = await h.db.refund.findFirstOrThrow({ where: { paymentId: e.paymentId } });
    expect(er).toMatchObject({ status: 'succeeded', amountPiasters: 21_500 });

    // Less than 24 hours: half of the session price.
    const l = await paid(m.slug, late);
    await l.s.agent.post(`/api/v1/bookings/${l.id}/cancel`).send({}).expect(200);
    expect(await getBooking(l.s.agent, l.id)).toMatchObject({
      status: 'refunded',
      payment: { status: 'partially_refunded' },
    });
    const lr = await h.db.refund.findFirstOrThrow({ where: { paymentId: l.paymentId } });
    expect(lr).toMatchObject({ status: 'succeeded', amountPiasters: 10_000 });
  });

  it('a payment that arrives after the hold: confirms if the slot is free, else refunds it', async () => {
    const m = await mentor();
    const all = await slots(m.slug);
    const free = all[0] ?? '';
    const taken = all.find((x) => Date.parse(x) - Date.parse(free) >= 2 * HOUR) ?? '';
    const expire = (id: string) =>
      h.db.booking.update({
        where: { id },
        data: { holdExpiresAt: new Date(Date.now() - 1000) },
      });

    // Still free: the late payment wins the slot back.
    const s1 = await student();
    const a = await hold(s1.agent, m.slug, free);
    const pa = await startPay(s1.agent, a.id);
    await expire(a.id);
    await h.bookingsService.sweep();
    await request(h.app).post(`/api/v1/payments/fake/checkout/${pa.paymentId}/success`).expect(303);
    expect((await getBooking(s1.agent, a.id)).status).toBe('confirmed');

    // Someone else booked it meanwhile: all the money goes back.
    const s2 = await student();
    const b = await hold(s2.agent, m.slug, taken);
    const pb = await startPay(s2.agent, b.id);
    await expire(b.id);
    await paid(m.slug, taken);
    await request(h.app).post(`/api/v1/payments/fake/checkout/${pb.paymentId}/success`).expect(303);
    expect(await getBooking(s2.agent, b.id)).toMatchObject({
      status: 'refunded',
      payment: { status: 'refunded' },
    });
    const r = await h.db.refund.findFirstOrThrow({ where: { paymentId: pb.paymentId } });
    expect(r).toMatchObject({ status: 'succeeded', amountPiasters: 21_500 });
  });
});
