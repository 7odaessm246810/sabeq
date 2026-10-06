/** Mentor verification lifecycle. A mentor is visible to students only when `approved`. */
export const MENTOR_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
] as const;
export type MentorApplicationStatus = (typeof MENTOR_APPLICATION_STATUSES)[number];

/** `pending` = slot held while the student pays. Becomes `confirmed` only from a verified payment webhook. */
export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'refunded',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** What the student pays with (all through Paymob — ADR-0006). */
export const PAYMENT_METHODS = ['card', 'wallet', 'kiosk'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** How a mentor gets paid out. */
export const PAYOUT_METHODS = ['bank_transfer', 'instapay', 'vodafone_cash'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_STATUSES = ['pending', 'processing', 'paid', 'failed'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
