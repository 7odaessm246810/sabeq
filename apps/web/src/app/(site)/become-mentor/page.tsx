import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'كن مرشدًا',
};

/** Screen built in Phase 04 (design: route `#/become-mentor`). */
export default function BecomeMentorPage() {
  return <PagePlaceholder title="كن مرشدًا" />;
}
