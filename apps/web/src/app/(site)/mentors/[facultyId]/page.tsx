import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'المرشدين',
};

/** Screen built in Phase 04 (design: route `#/mentors/:facultyId`). */
export default function MentorsDetailPage() {
  return <PagePlaceholder title="المرشدين" />;
}
