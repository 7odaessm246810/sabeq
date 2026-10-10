import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReviewsList } from './ReviewsList';

export const metadata: Metadata = { title: 'التقييمات' };

export default function ReviewsPage() {
  return (
    <Suspense fallback={<main className="adm-loading" aria-busy="true" />}>
      <ReviewsList />
    </Suspense>
  );
}
