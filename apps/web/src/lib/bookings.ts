/** Bookings (Phase 15) and paying for them (Phase 16): the signed-in user's sessions and the booking flow's calls. */
import type { BookingStatus, SessionKind } from '@sabeq/types';
import { api } from './api';

export interface Booking {
  id: string;
  kind: SessionKind;
  label: string;
  durationMin: number;
  medium: 'video' | 'audio';
  priceEgp: number;
  feeEgp: number;
  totalEgp: number;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  holdExpiresAt: string | null;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: 'student' | 'mentor' | 'admin' | null;
  refundEgp: number | null;
  mentor: {
    slug: string;
    name: string;
    photo: string | null;
    major: string;
    faculty: string;
    university: string;
  };
  /** The latest payment attempt. */
  payment: {
    status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
    method: PayMethod;
    failureReason: string | null;
    /** Kiosk payments: the code the student pays with at an Aman / Masary outlet. */
    kioskReference: string | null;
  } | null;
  /** The session room (Phase 17): open from `opensAt` to `closesAt`, and who has come in. */
  session: { opensAt: string; closesAt: string; mentorJoined: boolean; studentJoined: boolean };
  /** The student's rating of this session (Phase 18), once given. */
  review: { rating: number; text: string | null } | null;
  /** Only when the viewer is the mentor. */
  student?: { name: string };
  /** Only when the viewer is the mentor: session price minus the commission. */
  earningEgp?: number;
}

export type PayMethod = 'card' | 'wallet' | 'kiosk';

interface One {
  booking: Booking;
}

export const createBooking = (input: {
  mentorSlug: string;
  kind: SessionKind;
  startsAt: string;
  note?: string;
}) => api<One>('/bookings', { method: 'POST', body: input }).then((d) => d.booking);

export const getBooking = (id: string) => api<One>(`/bookings/${id}`).then((d) => d.booking);

/** Starts a payment: the browser then goes to the gateway's checkout (card numbers never touch Sabeq). */
export const startPayment = (id: string, method: PayMethod) =>
  api<{ redirectUrl: string; paymentId: string }>(`/bookings/${id}/pay`, {
    method: 'POST',
    body: { method },
  });

/** Methods the payment account takes right now. */
export const paymentMethods = () =>
  api<{ methods: PayMethod[]; mode: 'paymob' | 'fake' }>('/payments/methods');

/** Into the session room: the video address (null for the local test room). */
export const joinSession = (id: string) =>
  api<{ provider: 'daily' | 'fake'; url: string | null; closesAt: string }>(
    `/bookings/${id}/join`,
    {
      method: 'POST',
    },
  );

/** Rates a completed session (once). */
export const rateSession = (id: string, rating: number, text?: string) =>
  api<{ review: { id: string; rating: number; text: string | null } }>(`/bookings/${id}/review`, {
    method: 'POST',
    body: text ? { rating, text } : { rating },
  });

export const cancelBooking = (id: string, reason?: string) =>
  api<One>(`/bookings/${id}/cancel`, { method: 'POST', body: reason ? { reason } : {} }).then(
    (d) => d.booking,
  );

export const completeBooking = (id: string) =>
  api<One>(`/bookings/${id}/complete`, { method: 'POST' }).then((d) => d.booking);

export const markNoShow = (id: string) =>
  api<One>(`/bookings/${id}/no-show`, { method: 'POST' }).then((d) => d.booking);

export const listBookings = (scope: 'upcoming' | 'past') =>
  api<{ bookings: Booking[] }>(`/bookings?scope=${scope}`).then((d) => d.bookings);

/** An .ics calendar file for a confirmed session (works with Google, Apple and Outlook). */
export function calendarFile(b: Booking): Blob {
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sabeq//Sessions//AR',
    'BEGIN:VEVENT',
    `UID:${b.id}@sabeq`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.startsAt)}`,
    `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${b.label} مع ${b.mentor.name} — سابق`,
    'DESCRIPTION:رابط الجلسة هيظهر في «جلساتي» على سابق قبلها.',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return new Blob([ics], { type: 'text/calendar;charset=utf-8' });
}
