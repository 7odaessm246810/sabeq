/**
 * Availability (Phase 14): the slots students see, and the mentor's own weekly hours and
 * exceptions. Weekday 0 = Sunday … 6 = Saturday; minutes since midnight, Cairo time.
 */
import type { SessionKind } from '@sabeq/types';
import { api } from './api';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1';

export interface Availability {
  timezone: string;
  kind: SessionKind;
  durationMin: number;
  acceptsBookings: boolean;
  next: string | null;
  days: { date: string; slots: string[] }[];
}

/** Server side (profile page): slots change as people book, so the cache is short. */
export async function getAvailabilityServer(
  slug: string,
  kind: SessionKind = 'consultation',
): Promise<Availability | null> {
  const res = await fetch(`${API}/mentors/${slug}/availability?kind=${kind}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) return null;
  return ((await res.json()) as { data: { availability: Availability } }).data.availability;
}

export const getAvailability = (slug: string, kind: SessionKind) =>
  api<{ availability: Availability }>(`/mentors/${slug}/availability?kind=${kind}`).then(
    (d) => d.availability,
  );

export interface Rule {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityException {
  id: string;
  date: string;
  kind: 'blocked' | 'extra';
  startMinute: number | null;
  endMinute: number | null;
}

export interface OwnAvailability {
  timezone: string;
  rules: Rule[];
  exceptions: AvailabilityException[];
  upcoming: string[];
  limits: { horizonDays: number; minNoticeHours: number; stepMinutes: number };
}

interface Own {
  availability: OwnAvailability;
}
export const getOwnAvailability = () => api<Own>('/me/availability').then((d) => d.availability);
export const saveRules = (rules: Rule[]) =>
  api<Own>('/me/availability/rules', { method: 'PUT', body: { rules } }).then(
    (d) => d.availability,
  );
export const addException = (e: Omit<AvailabilityException, 'id'>) =>
  api<Own>('/me/availability/exceptions', { method: 'POST', body: e }).then((d) => d.availability);
export const deleteException = (id: string) =>
  api<Own>(`/me/availability/exceptions/${id}`, { method: 'DELETE' }).then((d) => d.availability);
