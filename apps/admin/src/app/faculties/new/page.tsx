import type { Metadata } from 'next';
import { FacultyEditor } from '../FacultyEditor';

export const metadata: Metadata = { title: 'كلية جديدة' };

export default async function NewFacultyPage({ searchParams }: PageProps<'/faculties/new'>) {
  const { university } = await searchParams;
  const universityId =
    typeof university === 'string' && /^[0-9a-f-]{36}$/.test(university) ? university : undefined;
  return <FacultyEditor {...(universityId ? { universityId } : {})} />;
}
