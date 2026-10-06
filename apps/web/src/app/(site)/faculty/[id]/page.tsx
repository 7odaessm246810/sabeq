import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'الكلية',
};

/** Screen built in Phase 04 (design: route `#/faculty/:id`). */
export default function FacultyDetailPage() {
  return <PagePlaceholder title="الكلية" />;
}
