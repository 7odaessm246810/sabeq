/**
 * Notifications (Phase 19): the in-app list, confirming an email address, emails for new
 * notifications (once each), and the reminder before a session (once).
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness } from '../../testing/harness.js';

const h = createHarness();
afterAll(() => h.close());

const MIN = 60_000;

async function student(name = 'ليلى حسن') {
  const s = await h.loginWeb('student');
  await h.db.user.update({ where: { id: s.userId }, data: { fullName: name } });
  return s;
}

const addresses = () => `t${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
const linkIn = (text: string) => /verify-email\?token=([\w.-]+)/.exec(text)?.[1] ?? '';

describe('in-app notifications', () => {
  it('lists newest first, pages, counts unread and marks them read — only your own', async () => {
    const s = await student();
    const other = await student();
    for (const [i, type] of ['booking.confirmed', 'review.created', 'session.reminder'].entries())
      await h.db.notification.create({
        data: {
          userId: s.userId,
          type,
          title: `إشعار ${i + 1}`,
          body: 'نص',
          data: { bookingId: '01a12688-abd1-7004-a9c7-d1d02e910a8a' },
          createdAt: new Date(Date.now() - (3 - i) * MIN),
        },
      });
    const theirs = await h.db.notification.create({
      data: { userId: other.userId, type: 'booking.confirmed', title: 'مش ليك', body: 'نص' },
    });

    const first = (await s.agent.get('/api/v1/me/notifications?limit=2').expect(200)).body.data;
    expect(first.unread).toBe(3);
    expect(first.items.map((n: { title: string }) => n.title)).toEqual(['إشعار 3', 'إشعار 2']);
    expect(first.items[0]).toMatchObject({
      type: 'session.reminder',
      read: false,
      link: '/sessions/01a12688-abd1-7004-a9c7-d1d02e910a8a',
    });
    const second = (
      await s.agent.get(`/api/v1/me/notifications?limit=2&before=${first.nextBefore}`).expect(200)
    ).body.data;
    expect(second.items.map((n: { title: string }) => n.title)).toEqual(['إشعار 1']);
    expect(second.nextBefore).toBeNull();

    await s.agent
      .post('/api/v1/me/notifications/read')
      .send({ ids: [first.items[0].id, theirs.id] })
      .expect(200);
    expect((await s.agent.get('/api/v1/me/notifications/unread')).body.data.unread).toBe(2);
    expect(
      (await h.db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt,
    ).toBeNull();

    await s.agent.post('/api/v1/me/notifications/read').send({}).expect(200);
    expect((await s.agent.get('/api/v1/me/notifications/unread')).body.data.unread).toBe(0);
    await request(h.app).get('/api/v1/me/notifications').expect(401);
  });
});

describe('email', () => {
  it('is used only after its owner confirms it with the emailed link', async () => {
    const s = await student();
    const address = addresses();
    await s.agent.put('/api/v1/me/email').send({ email: 'not-an-email' }).expect(400);

    const set = (
      await s.agent
        .put('/api/v1/me/email')
        .send({ email: ` ${address.toUpperCase()} ` })
        .expect(200)
    ).body.data;
    expect(set).toMatchObject({ email: address, verified: false });
    const sent = h.emails.findLast((e) => e.to === address);
    expect(sent?.subject).toContain('أكّد');
    const token = linkIn(sent?.text ?? '');
    expect(set.devLink).toContain(token);

    // Again within a minute: refused (no email flood).
    await s.agent.post('/api/v1/me/email/resend').expect(429);

    // A forged or altered link does nothing.
    await request(h.app)
      .post('/api/v1/email/verify')
      .send({ token: `${token}x` })
      .expect(409);
    const [payload] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ u: s.userId, e: 'other@example.com', x: Date.now() + MIN }),
    ).toString('base64url');
    await request(h.app)
      .post('/api/v1/email/verify')
      .send({ token: `${forged}.${token.split('.')[1]}` })
      .expect(409);
    expect(payload).toBeTruthy();

    // The real link works signed out (another device), once the address is still the account's.
    const ok = (await request(h.app).post('/api/v1/email/verify').send({ token }).expect(200)).body
      .data;
    expect(ok).toEqual({ email: address, verified: true });
    expect((await s.agent.get('/api/v1/me/email').expect(200)).body.data).toEqual({
      email: address,
      verified: true,
    });

    // Someone else can't take a used address.
    const other = await student();
    await other.agent.put('/api/v1/me/email').send({ email: address }).expect(400);

    await s.agent.delete('/api/v1/me/email').expect(200);
    expect((await s.agent.get('/api/v1/me/email')).body.data).toEqual({
      email: null,
      verified: false,
    });
  });

  it('every new notification is emailed once, to confirmed addresses only', async () => {
    const confirmed = await student();
    const address = addresses();
    await h.db.user.update({
      where: { id: confirmed.userId },
      data: { email: address, emailVerifiedAt: new Date() },
    });
    const unconfirmed = await student();
    const other = addresses();
    await h.db.user.update({ where: { id: unconfirmed.userId }, data: { email: other } });

    for (const u of [confirmed.userId, unconfirmed.userId])
      await h.db.notification.create({
        data: {
          userId: u,
          type: 'booking.cancelled',
          title: 'جلسة اتلغت',
          body: 'المرشد لغى جلسة بكرة، وهترجعلك فلوسك كاملة.',
          data: { bookingId: '01a12688-abd1-7004-a9c7-d1d02e910a8a' },
        },
      });

    // From before the address was confirmed: never emailed.
    await h.db.notification.create({
      data: {
        userId: confirmed.userId,
        type: 'booking.confirmed',
        title: 'قديم',
        body: 'قبل التأكيد',
        createdAt: new Date(Date.now() - 60 * MIN),
      },
    });

    await h.notificationsService.sweep();
    await h.notificationsService.sweep();
    const mails = h.emails.filter((e) => e.to === address);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ subject: 'جلسة اتلغت' });
    expect(mails[0]?.text).toContain('http://localhost:3000/sessions');
    expect(mails[0]?.html).toContain('dir="rtl"');
    expect(h.emails.some((e) => e.to === other)).toBe(false);

    const deliveries = await h.db.notificationDelivery.findMany({
      where: { notification: { userId: confirmed.userId } },
    });
    expect(deliveries.map((d) => d.status).sort()).toEqual(['failed', 'sent']);
    expect(h.emails.some((e) => e.subject === 'قديم' && e.to === address)).toBe(false);
  });
});

describe('session reminders', () => {
  it('an hour before a confirmed session, both sides, once', async () => {
    const m = await h.loginWeb('mentor');
    const faculty = await h.db.faculty.findFirstOrThrow({
      where: { university: { slug: 'cairo' } },
    });
    await h.db.user.update({ where: { id: m.userId }, data: { fullName: 'هشام فؤاد' } });
    await h.db.mentor.create({
      data: {
        userId: m.userId,
        slug: `m-rem-${m.userId.slice(-10)}`,
        kind: 'graduate',
        facultyId: faculty.id,
        majorLabel: 'طب',
        basePricePiasters: 20_000,
      },
    });
    const s = await student('ليلى حسن');
    const booking = (startsIn: number) =>
      h.db.booking.create({
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
          startsAt: new Date(Date.now() + startsIn * MIN),
          endsAt: new Date(Date.now() + (startsIn + 45) * MIN),
          status: 'confirmed',
        },
      });
    const soon = await booking(30);
    const later = await booking(3 * 60);

    await h.notificationsService.sweep();
    await h.notificationsService.sweep();
    const reminders = await h.db.notification.findMany({
      where: { type: 'session.reminder', data: { path: ['bookingId'], equals: soon.id } },
    });
    expect(reminders.map((r) => r.userId).sort()).toEqual([m.userId, s.userId].sort());
    expect(reminders.find((r) => r.userId === s.userId)?.body).toContain('هشام فؤاد');
    expect(
      await h.db.notification.count({
        where: { type: 'session.reminder', data: { path: ['bookingId'], equals: later.id } },
      }),
    ).toBe(0);
  });
});
