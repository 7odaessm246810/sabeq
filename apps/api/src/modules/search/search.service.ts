/**
 * Search box (Phase 13): suggestions while typing, and the week's most searched terms.
 *
 * Suggestions combine fields («الهندسة»), faculties at universities («كلية الهندسة — جامعة القاهرة»)
 * and mentors, all from the in-memory indexes of the catalog and mentors modules.
 *
 * «الأكثر بحثًا الأسبوع ده» is counted honestly and safely:
 * - a term is recorded only when someone commits a search (picks a result or presses Enter),
 *   and only if it finds something in the catalog — free text that matches nothing is never stored;
 * - each visitor counts once per term per day (hashed IP, forgotten after a day);
 * - a term is shown only after enough different visitors searched it this week.
 * Nothing ties a term to a person.
 */
import { createHash } from 'node:crypto';
import { normalizeArabic, searchTokens } from '@sabeq/utils';
import type { Redis } from 'ioredis';
import type { CatalogService } from '../catalog/catalog.service.js';
import type { MentorsService } from '../mentors/mentors.service.js';

const DAY_SECONDS = 86_400;
/** Different visitors a term needs this week before it is shown as popular. */
export const POPULAR_MIN_VISITORS = 5;
const POPULAR_SHOWN = 6;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

type Kinds = Awaited<ReturnType<CatalogService['kinds']>>;

export function createSearchService(deps: {
  catalog: CatalogService;
  mentors: MentorsService;
  redis: Redis;
  kindsTtlMs?: number;
}) {
  const { catalog, mentors, redis, kindsTtlMs = 60_000 } = deps;

  let kinds: { at: number; rows: Promise<Kinds> } | null = null;
  function currentKinds() {
    if (!kinds || Date.now() - kinds.at >= kindsTtlMs) {
      const rows = catalog.kinds();
      kinds = { at: Date.now(), rows };
      rows.catch(() => {
        if (kinds?.rows === rows) kinds = null;
      });
    }
    return kinds.rows;
  }

  async function suggest(q: string) {
    const tokens = searchTokens(q);
    if (!tokens.length) return { fields: [], colleges: [], mentors: [] };
    const [allKinds, colleges, found] = await Promise.all([
      currentKinds(),
      catalog.search({ q, page: 1, pageSize: 4 }),
      mentors.search({ q, sort: 'recommended', page: 1, pageSize: 3 }),
    ]);
    const fields = allKinds
      .filter((k) => {
        const text = normalizeArabic(`${k.name} ${k.fullName}`);
        return tokens.every((t) => text.includes(t));
      })
      .slice(0, 3)
      .map((k) => ({ slug: k.slug, name: k.fullName, icon: k.icon, mentorCount: k.mentorCount }));
    return {
      fields,
      colleges: colleges.results.map((c) => ({
        id: c.id,
        name: c.name,
        university: c.university.name,
        logo: c.logo,
        icon: c.kind.icon,
      })),
      mentors: found.results.map((m) => ({
        slug: m.slug,
        name: m.name,
        photo: m.photo,
        tone: m.tone,
        major: m.major,
        university: m.university.name,
        rating: m.rating,
      })),
    };
  }

  return {
    suggest,

    /** Records a committed search. Returns whether it counted. */
    async record(q: string, ip: string, now = new Date()): Promise<boolean> {
      const term = q.replace(/\s+/g, ' ').trim();
      const key = normalizeArabic(term);
      if (key.length < 2) return false;
      const hits = await suggest(term);
      if (!hits.fields.length && !hits.colleges.length && !hits.mentors.length) return false;

      const day = dayKey(now);
      const visitor = createHash('sha256').update(`${day}|${ip}`).digest('hex').slice(0, 16);
      const first = await redis.set(
        `search:seen:${day}:${visitor}:${key}`,
        '1',
        'EX',
        DAY_SECONDS,
        'NX',
      );
      if (first !== 'OK') return false;
      await redis
        .multi()
        .zincrby(`search:terms:${day}`, 1, key)
        .expire(`search:terms:${day}`, 8 * DAY_SECONDS)
        // How the term is shown: the latest spelling someone typed.
        .hset('search:labels', key, term)
        .exec();
      return true;
    },

    /** The week's most searched terms (each searched by enough different visitors). */
    async popular(now = new Date()): Promise<string[]> {
      const days = Array.from({ length: 7 }, (_, i) =>
        dayKey(new Date(now.getTime() - i * DAY_SECONDS * 1000)),
      );
      const totals = new Map<string, number>();
      for (const d of days) {
        const rows = await redis.zrange(`search:terms:${d}`, '0', '-1', 'WITHSCORES');
        for (let i = 0; i < rows.length; i += 2) {
          const term = rows[i] as string;
          totals.set(term, (totals.get(term) ?? 0) + Number(rows[i + 1]));
        }
      }
      const top = [...totals]
        .filter(([, n]) => n >= POPULAR_MIN_VISITORS)
        .sort((a, b) => b[1] - a[1])
        .slice(0, POPULAR_SHOWN)
        .map(([term]) => term);
      if (!top.length) return [];
      const labels = await redis.hmget('search:labels', ...top);
      return top.map((t, i) => labels[i] ?? t);
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
