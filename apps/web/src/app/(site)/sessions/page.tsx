import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'جلساتي',
  robots: { index: false, follow: false },
};

/** Screen built in Phase 04 (design: route `#/sessions`). */
export default function SessionsPage() {
  return <PagePlaceholder title="جلساتي" />;
}
