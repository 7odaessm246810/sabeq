import { describe, expect, it } from 'vitest';
import {
  FREE_CANCEL_HOURS,
  LATE_CANCEL_REFUND_BPS,
  STUDENT_FEE_PIASTERS,
  cancellationRefund,
} from './booking.js';
import { notificationLink } from './notifications.js';

const base = { pricePiasters: 20_000, feePiasters: STUDENT_FEE_PIASTERS };

describe('cancellationRefund (decisions 2026-10-07 and 2026-10-10)', () => {
  it('unpaid holds refund nothing', () => {
    expect(
      cancellationRefund({ ...base, status: 'pending', by: 'student', hoursBefore: 100 }),
    ).toEqual({
      refundPiasters: 0,
      shareBps: 0,
    });
  });

  it('a student cancelling 24 hours or more ahead gets everything back, fee included', () => {
    for (const hoursBefore of [FREE_CANCEL_HOURS, 72])
      expect(
        cancellationRefund({ ...base, status: 'confirmed', by: 'student', hoursBefore }),
      ).toEqual({
        refundPiasters: 21_500,
        shareBps: 10_000,
      });
  });

  it('later, half the session price; the fee is kept', () => {
    expect(
      cancellationRefund({
        ...base,
        status: 'confirmed',
        by: 'student',
        hoursBefore: FREE_CANCEL_HOURS - 0.01,
      }),
    ).toEqual({ refundPiasters: 10_000, shareBps: LATE_CANCEL_REFUND_BPS });
  });

  it('the mentor or the admin cancelling: always everything back', () => {
    for (const by of ['mentor', 'admin'] as const)
      expect(
        cancellationRefund({ ...base, status: 'confirmed', by, hoursBefore: 1 }).refundPiasters,
      ).toBe(21_500);
  });

  it('half of an odd price rounds down to the piaster', () => {
    expect(
      cancellationRefund({
        pricePiasters: 13_001,
        feePiasters: 1500,
        status: 'confirmed',
        by: 'student',
        hoursBefore: 2,
      }).refundPiasters,
    ).toBe(6_500);
  });
});

describe('notificationLink', () => {
  const id = '01a12688-abd1-7004-a9c7-d1d02e910a8a';
  it('reminders open the session room; other booking news opens «جلساتي»', () => {
    expect(notificationLink('session.reminder', { bookingId: id })).toBe(`/sessions/${id}`);
    expect(notificationLink('booking.cancelled', { bookingId: id })).toBe('/sessions');
    expect(notificationLink('booking.mentor_absent', null)).toBe('/sessions');
  });
  it('reviews, applications and payouts each have their page; unknown types fall back safely', () => {
    expect(notificationLink('review.created', {})).toBe('/sessions?tab=past');
    expect(notificationLink('mentor_application.approved', {})).toBe('/become-mentor/apply');
    expect(notificationLink('payout.paid', {})).toBe('/account/mentor');
    expect(notificationLink('something.new', 'not an object')).toBe('/sessions');
  });
  it('a reminder without a booking id does not build a broken link', () => {
    expect(notificationLink('session.reminder', { bookingId: 42 })).toBe('/sessions');
  });
});
