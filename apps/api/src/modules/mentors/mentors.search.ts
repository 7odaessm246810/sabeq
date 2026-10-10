/**
 * Mentor discovery (Phase 13). Listed mentors are held in memory (rebuilt every minute, or at once
 * after a change on this instance) and filtered, faceted and ranked here, with the same Arabic
 * folding as the faculty search — «هندسه» finds «هندسة», «اسيوط» finds «أسيوط».
 *
 * Each facet counts what the other filters leave, so the panel only offers choices with results.
 */
import { normalizeArabic, searchTokens } from '@sabeq/utils';
import type { MentorCard } from './mentors.service.js';

export interface IndexedMentor {
  card: MentorCard;
  facultyId: string;
  listedAt: number;
  /** Normalised text per field: the name and what they studied rank above topics and places. */
  text: { name: string; study: string; other: string };
}

export type MentorSort = 'recommended' | 'rating' | 'price_asc' | 'price_desc' | 'sessions';

export interface MentorQuery {
  q?: string | undefined;
  field?: string | undefined;
  faculty?: string | undefined;
  /** University slugs; any of them. */
  universities?: string[] | undefined;
  minRating?: number | undefined;
  maxPrice?: number | undefined;
  /** «متاح الأسبوع ده»: a bookable slot within the next 7 days. */
  available?: boolean | undefined;
  sort: MentorSort;
  page: number;
  pageSize: number;
}

export function indexMentor(
  card: MentorCard,
  extra: { facultyId: string; listedAt: Date | null; department: string | null },
): IndexedMentor {
  return {
    card,
    facultyId: extra.facultyId,
    listedAt: extra.listedAt?.getTime() ?? 0,
    text: {
      name: normalizeArabic(card.name),
      study: normalizeArabic(
        `${card.major} ${extra.department ?? ''} ${card.faculty.name} ${card.field.name} ${card.university.name}`,
      ),
      other: normalizeArabic(`${card.topics.join(' ')} ${card.city ?? ''} ${card.kindLabel}`),
    },
  };
}

function score(m: IndexedMentor, tokens: string[]): number {
  let total = 0;
  for (const t of tokens) {
    if (m.text.name.includes(t)) total += 4;
    else if (m.text.study.includes(t)) total += 3;
    else if (m.text.other.includes(t)) total += 1;
    else return 0;
  }
  return total;
}

const WEEK_MS = 7 * 86_400_000;

type Filter = 'field' | 'university' | 'other';

function passes(m: IndexedMentor, p: MentorQuery, skip?: Filter) {
  const c = m.card;
  return (
    (skip === 'field' || !p.field || c.field.slug === p.field) &&
    (skip === 'university' ||
      !p.universities?.length ||
      p.universities.includes(c.university.slug)) &&
    (!p.faculty || m.facultyId === p.faculty) &&
    (!p.minRating || (c.rating ?? 0) >= p.minRating) &&
    (!p.maxPrice || (c.priceEgp ?? Infinity) <= p.maxPrice) &&
    (!p.available || (c.nextSlot !== null && Date.parse(c.nextSlot) < Date.now() + WEEK_MS))
  );
}

const SORTS: Record<MentorSort, (a: IndexedMentor, b: IndexedMentor) => number> = {
  // Open for bookings first, then rated and experienced, then newest.
  recommended: (a, b) =>
    Number(b.card.nextSlot !== null) - Number(a.card.nextSlot !== null) ||
    Number(b.card.acceptsBookings) - Number(a.card.acceptsBookings) ||
    (b.card.rating ?? 0) - (a.card.rating ?? 0) ||
    b.card.sessions - a.card.sessions ||
    b.listedAt - a.listedAt,
  rating: (a, b) =>
    (b.card.rating ?? 0) - (a.card.rating ?? 0) || b.card.ratingCount - a.card.ratingCount,
  price_asc: (a, b) => (a.card.priceEgp ?? Infinity) - (b.card.priceEgp ?? Infinity),
  price_desc: (a, b) => (b.card.priceEgp ?? 0) - (a.card.priceEgp ?? 0),
  sessions: (a, b) => b.card.sessions - a.card.sessions,
};

export function searchMentors(index: readonly IndexedMentor[], p: MentorQuery) {
  const tokens = searchTokens(p.q ?? '');
  const scored = tokens.length
    ? index.map((m) => ({ m, s: score(m, tokens) })).filter((x) => x.s > 0)
    : index.map((m) => ({ m, s: 0 }));
  const matching = scored.map((x) => x.m);

  const results = scored
    .filter((x) => passes(x.m, p))
    .sort(
      (a, b) => b.s - a.s || SORTS[p.sort](a.m, b.m) || a.m.card.slug.localeCompare(b.m.card.slug),
    )
    .map((x) => x.m.card);

  const fields = new Map<string, { slug: string; name: string; count: number }>();
  for (const m of matching.filter((x) => passes(x, p, 'field'))) {
    const f = fields.get(m.card.field.slug) ?? { ...m.card.field, count: 0 };
    f.count++;
    fields.set(f.slug, f);
  }
  const universities = new Map<string, { slug: string; name: string; count: number }>();
  for (const m of matching.filter((x) => passes(x, p, 'university'))) {
    const u = universities.get(m.card.university.slug) ?? { ...m.card.university, count: 0 };
    u.count++;
    universities.set(u.slug, u);
  }
  const prices = matching.map((m) => m.card.priceEgp).filter((x): x is number => x !== null);

  const start = (p.page - 1) * p.pageSize;
  return {
    total: results.length,
    page: p.page,
    pageSize: p.pageSize,
    results: results.slice(start, start + p.pageSize),
    facets: {
      fields: [...fields.values()].sort((a, b) => b.count - a.count),
      universities: [...universities.values()].sort((a, b) => b.count - a.count),
      price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    },
  };
}
