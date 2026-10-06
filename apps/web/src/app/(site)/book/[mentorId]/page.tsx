import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'الحجز',
  robots: { index: false, follow: false },
};

/** Screen built in Phase 04 (design: route `#/book/:mentorId`). */
export default function BookDetailPage() {
  return <PagePlaceholder title="الحجز" />;
}
