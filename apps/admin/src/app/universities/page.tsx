import type { Metadata } from 'next';
import { UniversitiesHome } from './UniversitiesHome';

export const metadata: Metadata = { title: 'الجامعات والكليات' };

export default function UniversitiesPage() {
  return <UniversitiesHome />;
}
