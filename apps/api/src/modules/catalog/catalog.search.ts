/**
 * Faculty search (/explore). The whole catalog is a few hundred faculties, so it is held in memory
 * (rebuilt every minute, or at once after an admin edit) and every query is filtered and ranked
 * there — fast, and Arabic spelling variants are handled in one place (@sabeq/utils).
 *
 * Students can type straight away («هندسة القاهرة», «طب أسيوط») or narrow step by step: governorate,
 * then university, then field. Each facet counts what the other filters leave, so the next choice
 * only offers options that still have results.
 */
import {
  GOVERNORATES,
  UNIVERSITY_TYPE_LABELS,
  type AccreditationStatus,
  type FacultyCategory,
  type UniversityType,
} from '@sabeq/types';
import { normalizeArabic, searchTokens } from '@sabeq/utils';

export interface IndexedFaculty {
  id: string;
  name: string;
  logo: string | null;
  city: string | null;
  governorate: string | null;
  university: { slug: string; name: string; type: UniversityType; sortOrder: number };
  kind: { slug: string; name: string; icon: string; category: FacultyCategory; sortOrder: number };
  accreditation: { status: AccreditationStatus; expiresAt: string | null };
  cutoff: { year: number; track: string; minScore: number; maxScore: number } | null;
  mentorCount: number;
  /** Normalised text per field (matched by substring) and its words (whole-word matches rank higher). */
  text: { name: string; university: string; place: string; departments: string };
  words: { name: Set<string>; university: Set<string> };
  /** The field's short name as one word («طب», «هندسه»): an exact hit ranks first. */
  kindWord: string;
}

export interface SearchParams {
  q?: string | undefined;
  governorate?: string | undefined;
  university?: string | undefined;
  category?: FacultyCategory | undefined;
  kind?: string | undefined;
  type?: UniversityType | undefined;
  page: number;
  pageSize: number;
}

/** «القاهرة» and «بالقاهرة» are the same word for matching. */
const wordsOf = (text: string) =>
  new Set(
    text.split(' ').flatMap((w) => [w, w.length > 3 ? w.replace(/^(بال|لل|ال|ب|و)/, '') : w]),
  );

export function indexEntry(
  f: Omit<IndexedFaculty, 'text' | 'words' | 'kindWord'> & {
    kindFullName: string;
    universityNameEn: string | null;
    departments: string[];
  },
): IndexedFaculty {
  const { kindFullName, universityNameEn, departments, ...entry } = f;
  // «كلية الطب (بنات) بأسيوط»: the town is a place, not part of what the faculty is.
  const ownName = f.city ? f.name.split(`ب${f.city}`).join(' ') : f.name;
  const name = normalizeArabic(`${ownName} ${f.kind.name} ${kindFullName}`);
  const university = normalizeArabic(
    `${f.university.name} ${UNIVERSITY_TYPE_LABELS[f.university.type]} ${universityNameEn ?? ''} ${f.university.slug.replace(/-/g, ' ')}`,
  );
  return {
    ...entry,
    text: {
      name,
      university,
      place: normalizeArabic(`${f.city ?? ''} ${f.governorate ?? ''}`),
      departments: normalizeArabic(departments.join(' | ')),
    },
    words: { name: wordsOf(name), university: wordsOf(university) },
    kindWord: normalizeArabic(f.kind.name).replace(/^ال/, ''),
  };
}

/**
 * Where a word was found decides how well the faculty fits: the faculty itself, then its
 * university, then its town, then its departments. A word found nowhere excludes the faculty.
 */
function score(f: IndexedFaculty, tokens: string[]): number {
  let total = 0;
  for (const t of tokens) {
    if (f.text.name.includes(t))
      total += (f.words.name.has(t) ? 5 : 4) + (f.kindWord === t ? 1 : 0);
    else if (f.text.university.includes(t)) total += f.words.university.has(t) ? 4 : 3;
    else if (f.text.place.includes(t)) total += 2;
    else if (f.text.departments.includes(t)) total += 1;
    else return 0;
  }
  return total;
}

type Filter = 'governorate' | 'university' | 'category' | 'kind' | 'type';

const passes = (f: IndexedFaculty, p: SearchParams, skip?: Filter) =>
  (skip === 'governorate' || !p.governorate || f.governorate === p.governorate) &&
  (skip === 'university' || !p.university || f.university.slug === p.university) &&
  (skip === 'category' || !p.category || f.kind.category === p.category) &&
  (skip === 'kind' || !p.kind || f.kind.slug === p.kind) &&
  (skip === 'type' || !p.type || f.university.type === p.type);

function count<K extends string>(rows: IndexedFaculty[], key: (f: IndexedFaculty) => K | null) {
  const counts = new Map<K, number>();
  for (const f of rows) {
    const k = key(f);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function searchIndex(index: readonly IndexedFaculty[], p: SearchParams) {
  const tokens = searchTokens(p.q ?? '');
  const scored = tokens.length
    ? index.map((f) => ({ f, s: score(f, tokens) })).filter((x) => x.s > 0)
    : index.map((f) => ({ f, s: 0 }));
  const matching = scored.map((x) => x.f);

  const results = scored
    .filter((x) => passes(x.f, p))
    .sort(
      (a, b) =>
        b.s - a.s ||
        a.f.university.sortOrder - b.f.university.sortOrder ||
        a.f.kind.sortOrder - b.f.kind.sortOrder ||
        a.f.name.localeCompare(b.f.name, 'ar'),
    )
    .map((x) => x.f);

  const govCounts = count(
    matching.filter((f) => passes(f, p, 'governorate')),
    (f) => f.governorate,
  );
  const uniRows = matching.filter((f) => passes(f, p, 'university'));
  const uniCounts = count(uniRows, (f) => f.university.slug);
  const universities = [...new Map(uniRows.map((f) => [f.university.slug, f.university])).values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((u) => ({ slug: u.slug, name: u.name, type: u.type, count: uniCounts.get(u.slug) ?? 0 }));
  const catCounts = count(
    matching.filter((f) => passes(f, p, 'category')),
    (f) => f.kind.category,
  );
  const typeCounts = count(
    matching.filter((f) => passes(f, p, 'type')),
    (f) => f.university.type,
  );

  const start = (p.page - 1) * p.pageSize;
  return {
    total: results.length,
    page: p.page,
    pageSize: p.pageSize,
    results: results
      .slice(start, start + p.pageSize)
      .map(({ text: _t, words: _w, kindWord: _k, university, kind, ...f }) => ({
        ...f,
        university: { slug: university.slug, name: university.name, type: university.type },
        kind: { slug: kind.slug, name: kind.name, icon: kind.icon, category: kind.category },
      })),
    facets: {
      governorates: GOVERNORATES.filter((g) => govCounts.has(g)).map((g) => ({
        name: g,
        count: govCounts.get(g) ?? 0,
      })),
      universities,
      categories: [...catCounts].map(([category, n]) => ({ category, count: n })),
      types: [...typeCounts].map(([type, n]) => ({ type, count: n })),
    },
  };
}

export type SearchResult = ReturnType<typeof searchIndex>;
