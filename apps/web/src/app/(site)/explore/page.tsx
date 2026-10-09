import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getExploreData } from '@/lib/catalog';
import { ExploreClient } from './ExploreClient';

export const metadata: Metadata = {
  title: 'استكشف الكليات',
  description: 'اختار الكلية اللي بتفكر فيها، وشوف مين درس فيها فعلًا.',
  alternates: { canonical: '/explore' },
};

export default async function ExplorePage() {
  // Rendered per request (the API is not reachable while the image builds); the catalog itself
  // comes from Next's 5-minute data cache.
  await connection();
  const { faculties, universities } = await getExploreData();
  return <ExploreClient faculties={faculties} universities={universities} />;
}
