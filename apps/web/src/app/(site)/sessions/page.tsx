import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SessionsClient } from './SessionsClient';

export const metadata: Metadata = {
  title: 'جلساتي',
  robots: { index: false, follow: false },
};

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="page-body" aria-busy="true" />}>
      <SessionsClient />
    </Suspense>
  );
}
