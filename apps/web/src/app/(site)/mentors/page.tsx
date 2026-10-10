import type { Metadata } from 'next';
import { connection } from 'next/server';
import { filtersFromParams, searchMentorsServer } from '@/lib/mentors';
import { MentorsClient } from './MentorsClient';

export const metadata: Metadata = {
  title: 'المرشدين',
  description: 'طلاب وخريجين موثقين من كل الكليات. قارن بالجامعة والتقييم والسعر واحجز جلسة.',
  alternates: { canonical: '/mentors' },
};

export default async function MentorsPage({ searchParams }: PageProps<'/mentors'>) {
  await connection();
  const filters = filtersFromParams(await searchParams);
  const initial = await searchMentorsServer(filters, 12);
  return <MentorsClient initial={initial} initialFilters={filters} />;
}
