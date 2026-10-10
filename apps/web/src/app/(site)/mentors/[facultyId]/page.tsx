import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFacultyPage } from '@/lib/catalog';
import { fieldsOf, listMentors, toMentorView } from '@/lib/mentors';
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

/** Mentors of one field («الهندسة» at every university), from the API. */
export default async function FacultyMentorsPage({ params }: PageProps<'/mentors/[facultyId]'>) {
  await connection();
  const { facultyId } = await params;
  const [page, mentors] = await Promise.all([
    getFacultyPage(facultyId),
    listMentors({ field: facultyId, pageSize: 24 }),
  ]);
  if (!page) notFound();
  const fields = fieldsOf(mentors.results);
  if (!fields.some((x) => x.id === facultyId))
    fields.unshift({ id: facultyId, name: page.faculty.name });
  return (
    <MentorsClient
      facultyId={facultyId}
      mentors={mentors.results.map(toMentorView)}
      fields={fields}
    />
  );
}
