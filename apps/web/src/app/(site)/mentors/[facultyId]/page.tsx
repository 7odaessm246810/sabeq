import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFacultyPage } from '@/lib/catalog';
import { filtersFromParams, searchMentorsServer } from '@/lib/mentors';
import { MentorsClient } from '../MentorsClient';

export async function generateMetadata({
  params,
}: PageProps<'/mentors/[facultyId]'>): Promise<Metadata> {
  await connection();
  const page = await getFacultyPage((await params).facultyId);
  if (!page) return {};
  const f = page.faculty;
  return {
    title: `مرشدين ${f.name}`,
    description: `طلاب وخريجين موثقين درسوا ${f.full}. احجز جلسة واسمع التجربة من جوه.`,
    alternates: { canonical: `/mentors/${f.id}` },
  };
}

/** Mentors of one field («الهندسة» at every university) — /mentors with the field preselected. */
export default async function FacultyMentorsPage({
  params,
  searchParams,
}: PageProps<'/mentors/[facultyId]'>) {
  await connection();
  const { facultyId } = await params;
  const filters = { ...filtersFromParams(await searchParams), field: facultyId };
  const [page, initial] = await Promise.all([
    getFacultyPage(facultyId),
    searchMentorsServer(filters, 12),
  ]);
  if (!page) notFound();
  return <MentorsClient initial={initial} initialFilters={filters} fieldName={page.faculty.name} />;
}
