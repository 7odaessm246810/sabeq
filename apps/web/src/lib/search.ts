/**
 * The search box (Phase 13): suggestions while typing, the week's popular terms, and this device's
 * recent searches. Recent searches stay in the browser only; the API counts committed searches
 * anonymously for «الأكثر بحثًا».
 */
import type { IconName } from '@sabeq/ui';

export interface Suggestions {
  fields: { slug: string; name: string; icon: IconName; mentorCount: number }[];
  colleges: { id: string; name: string; university: string; logo: string | null; icon: IconName }[];
  mentors: {
    slug: string;
    name: string;
    photo: string | null;
    tone: 1 | 2 | 3;
    major: string;
    university: string;
    rating: number | null;
  }[];
}

export async function suggest(q: string, signal?: AbortSignal): Promise<Suggestions> {
  const res = await fetch(
    `/api/v1/search/suggest?q=${encodeURIComponent(q)}`,
    signal ? { signal } : {},
  );
  if (!res.ok) throw new Error(`suggest → ${res.status}`);
  return ((await res.json()) as { data: Suggestions }).data;
}

export async function popularTerms(): Promise<string[]> {
  const res = await fetch('/api/v1/search/popular');
  if (!res.ok) return [];
  return ((await res.json()) as { data: { terms: string[] } }).data.terms;
}

/** Fire-and-forget: counting must never slow the visitor down. */
export function logSearch(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return;
  void fetch('/api/v1/search/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: term }),
    keepalive: true,
  }).catch(() => undefined);
}

const RECENT_KEY = 'sabeq:recent-searches';
const RECENT_MAX = 5;

/** This device's recent searches (localStorage may be unavailable — then there are none). */
export function recentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberSearch(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return;
  try {
    const next = [term, ...recentSearches().filter((t) => t !== term)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage blocked: recent searches are a convenience only.
  }
}

export function forgetSearches() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing to forget.
  }
}
