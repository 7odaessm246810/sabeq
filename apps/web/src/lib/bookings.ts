/** Bookings (Phase 15): the signed-in user's sessions and the booking flow's calls. */
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
  /** Only when the viewer is the mentor. */
  student?: { name: string };
  /** Only when the viewer is the mentor: session price minus the commission. */
  earningEgp?: number;
}

interface One {
  booking: Booking;
}

export const createBooking = (input: {
  mentorSlug: string;
  kind: SessionKind;
  startsAt: string;
  note?: string;
}) => api<One>('/bookings', { method: 'POST', body: input }).then((d) => d.booking);

export const devPay = (id: string) =>
  api<One>(`/bookings/${id}/dev-pay`, { method: 'POST' }).then((d) => d.booking);

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
