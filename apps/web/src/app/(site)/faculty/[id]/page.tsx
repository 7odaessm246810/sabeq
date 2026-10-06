import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FACULTIES, getFaculty } from '@/lib/mock/data';
import { FacultyClient } from './FacultyClient';

/** Faculty pages are public and SEO-critical: pre-render every known faculty. */
export function generateStaticParams() {
  return FACULTIES.map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: PageProps<'/faculty/[id]'>): Promise<Metadata> {
  const f = getFaculty((await params).id);
  if (!f) return {};
  return {
    title: f.full,
    description: `${f.full}: ${f.desc}. اسأل طلاب وخريجين موثقين درسوا فيها فعلًا.`,
    alternates: { canonical: `/faculty/${f.id}` },
  };
}

export default async function FacultyPage({ params }: PageProps<'/faculty/[id]'>) {
  const f = getFaculty((await params).id);
  if (!f) notFound();
  return <FacultyClient faculty={f} />;
}
