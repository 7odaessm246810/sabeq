import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'التقديم كمرشد',
  robots: { index: false, follow: false },
};

/** Screen built in Phase 04 (design: route `#/become-mentor/apply`). */
export default function BecomeMentorApplyPage() {
  return <PagePlaceholder title="التقديم كمرشد" />;
}
