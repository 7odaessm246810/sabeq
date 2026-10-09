import type { Metadata } from 'next';
import { FacultyEditor } from '../FacultyEditor';

export const metadata: Metadata = { title: 'تعديل كلية' };

export default async function FacultyPage({ params }: PageProps<'/faculties/[id]'>) {
  const { id } = await params;
  return <FacultyEditor id={id} />;
}
