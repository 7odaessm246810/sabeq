import type { Metadata } from 'next';
import { connection } from 'next/server';
import { fieldsOf, listMentors, toMentorView } from '@/lib/mentors';
import { MentorsClient } from './MentorsClient';

export const metadata: Metadata = {
  title: 'المرشدين',
  description: 'طلاب وخريجين موثقين من كل الكليات. قارن بالجامعة والتقييم والسعر واحجز جلسة.',
  alternates: { canonical: '/mentors' },
};

export default async function MentorsPage() {
  await connection();
  const { results } = await listMentors({ pageSize: 24 });
  return <MentorsClient mentors={results.map(toMentorView)} fields={fieldsOf(results)} />;
}
