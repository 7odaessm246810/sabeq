import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MENTORS, getMentor } from '@/lib/mock/data';
import { MentorProfile } from './MentorProfile';

export function generateStaticParams() {
  return MENTORS.map((m) => ({ id: String(m.id) }));
}

export async function generateMetadata({ params }: PageProps<'/mentor/[id]'>): Promise<Metadata> {
  const m = getMentor((await params).id);
  if (!m) return {};
  return {
    title: `${m.name} — ${m.major}`,
    description: `${m.name}، ${m.major} · ${m.uni}. مرشد موثق على سابق. ${m.bio}`,
    alternates: { canonical: `/mentor/${m.id}` },
  };
}

export default async function MentorPage({ params }: PageProps<'/mentor/[id]'>) {
  const m = getMentor((await params).id);
  if (!m) notFound();
  return <MentorProfile mentor={m} />;
}
