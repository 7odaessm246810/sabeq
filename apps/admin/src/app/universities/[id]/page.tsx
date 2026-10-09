import type { Metadata } from 'next';
import { UniversityEditor } from './UniversityEditor';

export const metadata: Metadata = { title: 'الجامعة' };

export default async function UniversityPage({ params }: PageProps<'/universities/[id]'>) {
  const { id } = await params;
  return <UniversityEditor id={id} />;
}
