import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'المرشدين',
};

/** Screen built in Phase 04 (design: route `#/mentors`). */
export default function MentorsPage() {
  return <PagePlaceholder title="المرشدين" />;
}
