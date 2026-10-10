/**
 * Notifications (Phase 19), shared by the API (emails) and the website (the bell): where each one
 * leads. Types are `area.event` strings written by the modules that raise them.
 */

/** A reminder goes out this long before a session starts (design: «قبلها بساعة»). */
export const REMINDER_MINUTES_BEFORE = 60;

/** The website path a notification opens. */
export function notificationLink(type: string, data: unknown): string {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const bookingId = typeof d.bookingId === 'string' ? d.bookingId : null;
  if (type === 'session.reminder' && bookingId) return `/sessions/${bookingId}`;
  if (type.startsWith('booking.') || type.startsWith('session.')) return '/sessions';
  if (type === 'review.created') return '/sessions?tab=past';
  if (type.startsWith('mentor_application.')) return '/become-mentor/apply';
  if (type.startsWith('payout.')) return '/account/mentor';
  return '/sessions';
}
