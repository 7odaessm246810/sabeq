import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FACULTIES, getFaculty } from '@/lib/mock/data';
import { MentorsClient } from '../MentorsClient';

export function generateStaticParams() {
  return FACULTIES.map((f) => ({ facultyId: f.id }));
}

export async function generateMetadata({
  params,
}: PageProps<'/mentors/[facultyId]'>): Promise<Metadata> {
  const f = getFaculty((await params).facultyId);
  if (!f) return {};
  return {
    title: `مرشدين ${f.name}`,
    description: `طلاب وخريجين موثقين درسوا ${f.full}. احجز جلسة واسمع التجربة من جوه.`,
    alternates: { canonical: `/mentors/${f.id}` },
  };
}

export default async function FacultyMentorsPage({ params }: PageProps<'/mentors/[facultyId]'>) {
  const { facultyId } = await params;
  if (!getFaculty(facultyId)) notFound();
  return <MentorsClient facultyId={facultyId} />;
}
