import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getAvailabilityServer } from '@/lib/availability';
import { getMentorProfile } from '@/lib/mentors';
import { MentorProfile } from './MentorProfile';

export async function generateMetadata({ params }: PageProps<'/mentor/[id]'>): Promise<Metadata> {
  await connection();
  const m = await getMentorProfile((await params).id);
  if (!m) return {};
  return {
    title: `${m.name} — ${m.major}`,
    description: `${m.name}، ${m.major} · ${m.university.name}. مرشد موثق على سابق.${m.bio ? ` ${m.bio.slice(0, 120)}` : ''}`,
    alternates: { canonical: `/mentor/${m.slug}` },
  };
}

/** Public and SEO-critical: rendered on request from the mentors API (1-minute data cache). */
export default async function MentorPage({ params }: PageProps<'/mentor/[id]'>) {
  await connection();
  const slug = (await params).id;
  const [m, availability] = await Promise.all([
    getMentorProfile(slug),
    getAvailabilityServer(slug).catch(() => null),
  ]);
  if (!m) notFound();
  return <MentorProfile mentor={m} availability={availability} />;
}
