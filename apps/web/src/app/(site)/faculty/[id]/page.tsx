import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFacultyPage } from '@/lib/catalog';
import { listMentors, toMentorView } from '@/lib/mentors';
import { FacultyClient } from './FacultyClient';

export async function generateMetadata({ params }: PageProps<'/faculty/[id]'>): Promise<Metadata> {
  await connection();
  const page = await getFacultyPage((await params).id);
  if (!page) return {};
  const f = page.faculty;
  return {
    title: f.full,
    description: `${f.full}: ${f.desc}. اسأل طلاب وخريجين موثقين درسوا فيها فعلًا.`,
    alternates: { canonical: `/faculty/${f.id}` },
  };
}

/** Public and SEO-critical: rendered on request from the catalog API (5-minute data cache). */
export default async function FacultyPage({ params }: PageProps<'/faculty/[id]'>) {
  await connection();
  const id = (await params).id;
  const [page, mentors] = await Promise.all([
    getFacultyPage(id),
    listMentors({ field: id, pageSize: 12 }),
  ]);
  if (!page) notFound();
  return (
    <FacultyClient
      faculty={page.faculty}
      offerings={page.offerings}
      sources={page.sources}
      mentors={mentors.results.map(toMentorView)}
    />
  );
}
