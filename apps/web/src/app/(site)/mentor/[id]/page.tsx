import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'ملف المرشد',
};

/** Screen built in Phase 04 (design: route `#/mentor/:id`). */
export default function MentorDetailPage() {
  return <PagePlaceholder title="ملف المرشد" />;
}
