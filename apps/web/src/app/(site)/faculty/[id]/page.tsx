import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFacultyPage } from '@/lib/catalog';
import { FacultyClient } from './FacultyClient';

export async function generateMetadata({ params }: PageProps<'/faculty/[id]'>): Promise<Metadata> {
  await connection();
  const f = await getFacultyPage((await params).id);
  if (!f) return {};
  return {
    title: f.full,
    description: `${f.full}: ${f.desc}. اسأل طلاب وخريجين موثقين درسوا فيها فعلًا.`,
    alternates: { canonical: `/faculty/${f.id}` },
  };
}

/** Public and SEO-critical: rendered on request from the catalog API (5-minute data cache). */
export default async function FacultyPage({ params }: PageProps<'/faculty/[id]'>) {
  await connection();
  const f = await getFacultyPage((await params).id);
  if (!f) notFound();
  return <FacultyClient faculty={f} />;
}
