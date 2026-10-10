/**
 * Mentor profiles (Phase 12). Server components read public profiles and lists straight from the
 * API (1-minute data cache); the browser uses the same-origin proxy for the mentor's own profile and
 * students' saved mentors. API cards are mapped to the `Mentor` shape the design's components use.
 */
import type { MentorKind, SessionKind } from '@sabeq/types';
import { api } from './api';
import type { Mentor } from './mock/data';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1';

export interface MentorCardData {
  slug: string;
  name: string;
  photo: string | null;
  tone: 1 | 2 | 3;
  kind: MentorKind;
  kindLabel: string;
  major: string;
  graduationYear: number | null;
  city: string | null;
  field: { slug: string; name: string };
  faculty: { id: string; name: string; logo: string | null };
  university: { slug: string; name: string };
  rating: number | null;
  ratingCount: number;
  sessions: number;
  priceEgp: number | null;
  acceptsBookings: boolean;
  topics: string[];
}

export interface MentorProfileData extends MentorCardData {
  bio: string;
  department: string | null;
  offerings: {
    kind: SessionKind;
    label: string;
    durationMin: number;
    medium: 'video' | 'audio';
    priceEgp: number;
  }[];
  reviews: {
    id: string;
    rating: number;
    text: string | null;
    topic: string | null;
    date: string;
    name: string;
  }[];
}

export interface MentorList {
  total: number;
  page: number;
  pageSize: number;
  results: MentorCardData[];
  facets?: {
    fields: { slug: string; name: string; count: number }[];
    universities: { slug: string; name: string; count: number }[];
    price: { min: number; max: number } | null;
  };
}

/** /mentors filters (Phase 13) — the same names in the page URL and the API query. */
export interface MentorFilters {
  q?: string | undefined;
  field?: string | undefined;
  universities?: string[] | undefined;
  minRating?: number | undefined;
  maxPrice?: number | undefined;
  available?: boolean | undefined;
  sort?: 'recommended' | 'rating' | 'price_asc' | 'price_desc' | 'sessions' | undefined;
}

export function mentorQuery(f: MentorFilters, page = 1, pageSize = 12): string {
  const qs = new URLSearchParams();
  if (f.q?.trim()) qs.set('q', f.q.trim());
  if (f.field) qs.set('field', f.field);
  if (f.universities?.length) qs.set('university', f.universities.join(','));
  if (f.minRating) qs.set('minRating', String(f.minRating));
  if (f.maxPrice) qs.set('maxPrice', String(f.maxPrice));
  if (f.available) qs.set('available', '1');
  if (f.sort && f.sort !== 'recommended') qs.set('sort', f.sort);
  if (page > 1) qs.set('page', String(page));
  if (pageSize !== 12) qs.set('pageSize', String(pageSize));
  return qs.toString();
}

/** Browser side, through the same-origin proxy. */
export async function searchMentors(
  f: MentorFilters,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<MentorList> {
  const res = await fetch(
    `/api/v1/mentors?${mentorQuery(f, page, pageSize)}`,
    signal ? { signal } : {},
  );
  if (!res.ok) throw new Error(`mentors → ${res.status}`);
  return ((await res.json()) as { data: MentorList }).data;
}

/** Server side: the first page for /mentors (search engines and shared links see real results). */
export async function searchMentorsServer(f: MentorFilters, pageSize: number): Promise<MentorList> {
  return (
    (await get<MentorList>(`/mentors?${mentorQuery(f, 1, pageSize)}`)) ?? {
      total: 0,
      page: 1,
      pageSize,
      results: [],
    }
  );
}

/** Filters from a page URL; anything the API would refuse is dropped. */
export function filtersFromParams(
  sp: Record<string, string | string[] | undefined>,
): MentorFilters {
  const one = (k: string) => (typeof sp[k] === 'string' ? sp[k] : undefined);
  const f: MentorFilters = {};
  const q = one('q')?.slice(0, 100);
  if (q) f.q = q;
  const field = one('field');
  if (field && /^[a-z0-9-]{1,40}$/.test(field)) f.field = field;
  const unis = one('university')
    ?.split(',')
    .filter((u) => /^[a-z0-9-]{1,60}$/.test(u))
    .slice(0, 20);
  if (unis?.length) f.universities = unis;
  const minRating = Number(one('minRating'));
  if (minRating > 0 && minRating <= 5) f.minRating = minRating;
  const maxPrice = Number(one('maxPrice'));
  if (Number.isInteger(maxPrice) && maxPrice > 0 && maxPrice <= 10_000) f.maxPrice = maxPrice;
  if (one('available') === '1') f.available = true;
  const sort = one('sort');
  if (sort === 'rating' || sort === 'price_asc' || sort === 'price_desc' || sort === 'sessions')
    f.sort = sort;
  return f;
}

/** API card → the design's `Mentor` shape (cards, filters). */
export function toMentorView(m: MentorCardData): Mentor {
  return {
    id: m.slug,
    name: m.name,
    facId: m.field.slug,
    faculty: m.faculty.name,
    uni: m.university.name,
    major: m.major,
    year: m.graduationYear,
    rating: m.rating === null ? 'جديد' : m.rating.toFixed(1),
    sessions: m.sessions,
    price: m.priceEgp ?? 0,
    city: m.city ?? '',
    tone: m.tone,
    available: m.acceptsBookings,
    // Real open slots arrive with scheduling (Phase 14).
    next: null,
    bio: '',
    topics: m.topics,
    photo: m.photo,
  };
}

async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`mentors ${path} → ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

export async function getMentorProfile(slug: string): Promise<MentorProfileData | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return (await get<{ mentor: MentorProfileData }>(`/mentors/${slug}`))?.mentor ?? null;
}

export async function listMentors(params: {
  field?: string;
  faculty?: string;
  university?: string;
  sort?: 'recommended' | 'rating' | 'price_asc' | 'price_desc';
  pageSize?: number;
}): Promise<MentorList> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  return (
    (await get<MentorList>(`/mentors?${qs.toString()}`)) ?? {
      total: 0,
      page: 1,
      pageSize: 0,
      results: [],
    }
  );
}

// ---------- browser: the mentor's own profile ----------

export interface OwnMentorProfile {
  slug: string;
  name: string | null;
  photo: string | null;
  tone: 1 | 2 | 3;
  isListed: boolean;
  acceptsBookings: boolean;
  bio: string;
  city: string | null;
  topics: string[];
  basePriceEgp: number | null;
  departmentId: string | null;
  departments: { id: string; name: string }[];
  verified: {
    kind: MentorKind;
    kindLabel: string;
    faculty: string;
    university: string;
    major: string;
    graduationYear: number | null;
  };
}

export type OwnMentorPatch = Partial<{
  bio: string;
  city: string | null;
  topics: string[];
  basePriceEgp: number;
  acceptsBookings: boolean;
  departmentId: string | null;
}>;

export const getOwnMentor = () =>
  api<{ mentor: OwnMentorProfile }>('/me/mentor').then((d) => d.mentor);
export const updateOwnMentor = (patch: OwnMentorPatch) =>
  api<{ mentor: OwnMentorProfile }>('/me/mentor', { method: 'PATCH', body: patch }).then(
    (d) => d.mentor,
  );
export const uploadMentorPhoto = (file: File) =>
  api<{ photo: string }>('/me/mentor/photo', { method: 'PUT', file }).then((d) => d.photo);
export const removeMentorPhoto = () => api('/me/mentor/photo', { method: 'DELETE' });

// ---------- browser: students' saved mentors ----------

export const listSaved = () =>
  api<{ mentors: MentorCardData[] }>('/me/saved-mentors').then((d) => d.mentors);
export const saveMentor = (slug: string) => api(`/me/saved-mentors/${slug}`, { method: 'PUT' });
export const unsaveMentor = (slug: string) =>
  api(`/me/saved-mentors/${slug}`, { method: 'DELETE' });
