import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from './VerifyEmail';

export const metadata: Metadata = {
  title: 'تأكيد الإيميل',
  robots: { index: false, follow: false },
};

/** The link from the confirmation email (Phase 19) — works signed out, on any device. */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="page-body" aria-busy="true" />}>
      <VerifyEmail />
    </Suspense>
  );
}
