import { FACULTY_CATEGORIES, UNIVERSITY_TYPES } from '@sabeq/types';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getExploreData, searchFacultiesServer, type SearchParams } from '@/lib/catalog';
import { ExploreClient } from './ExploreClient';

export const metadata: Metadata = {
  title: 'استكشف الكليات',
  description:
    'دوّر على أي كلية في أي جامعة مصرية: حكومية وأزهر وخاصة وأهلية، بالاعتماد والتنسيق والأقسام.',
  alternates: { canonical: '/explore' },
};

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** Only values the API accepts; anything else in the URL is ignored. */
function filtersFrom(
  sp: Record<string, string | string[] | undefined>,
): Omit<SearchParams, 'page'> {
  const f: Omit<SearchParams, 'page'> = {};
  const q = one(sp.q)?.slice(0, 100);
  if (q) f.q = q;
  const governorate = one(sp.governorate)?.slice(0, 60);
  if (governorate) f.governorate = governorate;
  const university = one(sp.university);
  if (university && /^[a-z0-9-]{1,60}$/.test(university)) f.university = university;
  const category = one(sp.category);
  if (category && (FACULTY_CATEGORIES as readonly string[]).includes(category))
    f.category = category as SearchParams['category'];
  const type = one(sp.type);
  if (type && (UNIVERSITY_TYPES as readonly string[]).includes(type))
    f.type = type as SearchParams['type'];
  return f;
}

export default async function ExplorePage({ searchParams }: PageProps<'/explore'>) {
  // Rendered per request (the API is not reachable while the image builds); the catalog itself
  // comes from Next's data cache.
  await connection();
  const filters = filtersFrom(await searchParams);
  const [{ faculties }, initial] = await Promise.all([
    getExploreData(),
    searchFacultiesServer(filters),
  ]);
  return <ExploreClient kinds={faculties} initial={initial} initialFilters={filters} />;
}
