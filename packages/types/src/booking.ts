import type { BookingStatus } from './statuses.js';

/**
 * Booking rules (Phase 15), shared by the API (enforcement) and the website (what students are told).
 * Decisions 2026-10-07 and 2026-10-10.
 */

/** Fixed service fee the student pays on top of the session price (design: «رسوم الخدمة»). */
export const STUDENT_FEE_PIASTERS = 1500;

/** A chosen slot is held this long while the student pays; then it is released. */
export const BOOKING_HOLD_MINUTES = 10;

/** Cancelling at least this long before the session refunds everything, fee included. */
export const FREE_CANCEL_HOURS = 24;

/** A later cancellation by the student refunds this share of the session price (fee kept). */
export const LATE_CANCEL_REFUND_BPS = 5000;

/** Sessions the mentor didn't mark are completed automatically this long after they end. */
export const AUTO_COMPLETE_HOURS = 24;

/** The session room opens this long before the start (Phase 17)… */
export const JOIN_OPENS_MINUTES_BEFORE = 10;
/** …and closes this long after the end. */
export const JOIN_CLOSES_MINUTES_AFTER = 15;

/**
 * If the mentor hasn't joined this long after the start, the session is cancelled with a full
 * refund (decision 2026-10-10). Also the earliest a mentor can mark the student absent.
 */
export const NO_SHOW_GRACE_MINUTES = 15;

/** A completed session can be rated by its student, once, for this long after it ended (Phase 18). */
export const REVIEW_WINDOW_DAYS = 30;
export const REVIEW_TEXT_MAX = 1000;

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'مستني الدفع',
  confirmed: 'قادمة',
  cancelled: 'ملغاة',
  completed: 'مكتملة',
  no_show: 'ما اتعملتش',
  refunded: 'ملغاة · تم الاسترداد',
};

/**
 * What a cancellation refunds, in piasters. Unpaid (pending) bookings refund nothing — nothing was
 * paid. The mentor cancelling, or the student cancelling early enough, refunds everything.
 */
export function cancellationRefund(input: {
  status: BookingStatus;
  by: 'student' | 'mentor' | 'admin';
  hoursBefore: number;
  pricePiasters: number;
  feePiasters: number;
}): { refundPiasters: number; shareBps: number } {
  if (input.status !== 'confirmed') return { refundPiasters: 0, shareBps: 0 };
  if (input.by !== 'student' || input.hoursBefore >= FREE_CANCEL_HOURS)
    return { refundPiasters: input.pricePiasters + input.feePiasters, shareBps: 10_000 };
  return {
    refundPiasters: Math.floor((input.pricePiasters * LATE_CANCEL_REFUND_BPS) / 10_000),
    shareBps: LATE_CANCEL_REFUND_BPS,
  };
}
